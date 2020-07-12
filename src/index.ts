import {
  LexEvent as AWSLexEvent,
  LexResult as AWSLexResult,
  Context,
  LexDialogActionClose,
  LexDialogActionDelegate,
  LexDialogActionElicitSlot,
  LexSlotResolution
} from 'aws-lambda';


/**
 * This is the entry point for all LexEvent message handling.  
 * 
 * Lex-provided messages are given to this function, along with a corresponding LexEventHandler implementation.  
 * The function will delegate handling the message to an appropriate EventHandler implementation.
 * 
 * Each LexEvent is specific to either Dialog or Fulfillment.  The route function evalutes invocation source
 * to determine which it is and then delegates to the appropriate LexEventHandler implementation.
 *
 * @param lexEvent
 * @param ctx
 * @param eventHandler
 */
export const route = 
async (lexEvent: Ext.LexEvent, ctx: Context, eventHandler: LexEventHandler): 
Promise<Ext.LexResult> => {

  console.info('::route(:LexEvent, ..).. ');
  console.log(JSON.stringify(lexEvent));

  try {
    if (lexEvent.invocationSource === 'DialogCodeHook') {
      const r: Ext.LexResult = await eventHandler.dialog.handle(lexEvent);
      return r;
    }

    if (lexEvent.invocationSource === 'FulfillmentCodeHook') {
      const r: Ext.LexResult = await eventHandler.fulfill.handle(lexEvent);
      return r;
    }

    throw new Error('malformed Lex Event');
  } catch (e) {
    console.log('::route(..) - threw exception! ' + e);
    return Promise.resolve(
      LexResultFactory.dialogActionClose({
        fulfillmentState: 'Failed',
        message: {
          contentType: 'PlainText',
          content: 'Unxpected error occurred',
        },
        sessionAttributes: lexEvent.sessionAttributes
      }),
    );
  }
};


/**
 * Extend some of the AWS-defined types
 */
export namespace Ext {

  /**
   * The AWS LexEvent needs to include additional properties.
   */
  export interface LexEvent extends AWSLexEvent {
    recentIntentSummaryView: IntentSummary[];
    sentimentResponse: { 
      SentimentScore: { 
        Mixed: number,
        Positive: number,
        Neutral: number,
        Negative: number
      },
      SentimentLabel: string 
    };
    kendraResponse: string;
  }
  
  /**
   * LexResult objects can contain a recentIntentSummaryView
   */
  export interface LexResult extends AWSLexResult {
    recentIntentSummaryView?: IntentSummary[];
  }

}


/**
 * IntentSummary is not defined in aws-lambda.
 */
export interface IntentSummary {
  intentName: string;
  checkpointLabel: string;
  slots: { [name: string]: string | null };
  confirmationStatus: 'None' | 'Confirmed' | 'Denied';
  dialogActionType: 'ElicitIntent' | 'ElicitSlot' | 'ConfirmIntent' | 'Delegate' | 'Close';
  fulfillmentState: 'Fulfilled' | 'Failed';
  slotToElicit: string;
}
  

export interface ResponseMessage {
  contentType: 'PlainText' | 'SSML' | 'CustomPayload';
  content: string;
}


/**
 * Lex-provided messages are handled by implementations of this interface.
 *
 * There are 2 types of Lex Events accounted for: dialog and fulfillment.
 * 
 * The dialog EventHandler is invoked when a user submits a message to Lex when their session is
 * associated with an Intent with which this handler is associated.   
 * 
 * Fulfillment occurs when a user has "filled all slots", and the user's Intent is therefore 
 * ready to completed.
 *
 */
export interface LexEventHandler {
  dialog: EventHandler;
  fulfill: EventHandler;
}


/**
 * Every mesage from Lex is handled by an implementation of this Interface
 */
export interface EventHandler {
  handle: (lexEvent: Ext.LexEvent) => Promise<Ext.LexResult>;
}


/**
 * This library includes a DefaultDialogEventHandler that can be used to handle Dialog Lex events if desired.  This 
 * default implementation is parameterized by various configuration defined below. 
 */


/**
 * Clients using the DefaultDialogEventHandler use an implementation of this interface to configure event handling.
 */
export interface DialogEventHandlerConfig {
  /**
   * List of SlotEvaluators ... one for each Slot.  
   */
  slotEvaluatorArray: SlotEvaluator[];
  /**
   * An optional hook function invoked after a Slot is evaluated.  The function is invoked whether the Slot 
   * value is valid or not.  
   */
  slotEvaluationHook?: 
    (lexEvent: Ext.LexEvent, slotEvaluator: SlotEvaluator, slotEvalResult: SlotEvaluationResult) 
    => void;
  /**
   * Optional hook function invoked when all Slot values are determined to be valid.
   */
  allSlotsValidHook?: (lexEvent: Ext.LexEvent) => void;
  /**
   * An optional function.  If specified, will be used to generate an appropriate Lex result when an invalid
   * Slot value is found.  If not specified, the DefaultDialogEventHandler will return an ElicitSlot dialog action 
   * message.
   */
  invalidSlotResponder?: 
    (lexEvent: Ext.LexEvent, slotEvaluator: SlotEvaluator, slotEvalResult: SlotEvaluationResult) 
    => Ext.LexResult;
  /**
   * An optional function.  If specified, will be used to generate an appropriate Lex result when all Slot values
   * are assessed as valid.  If not specified, the DefaultDialogEventHandler will return a Delegate dialog 
   * action message.
   */
  allSlotsValidResponder?: (lexEvent: Ext.LexEvent) => Ext.LexResult;
}


/**
 * Implementations of this interface parameterize Slot evaluation by the DefaultDialogEventHandler. 
 */
export interface SlotEvaluator {
  /**
   * If the evaluate function determines the Slot value is invalid, this message will be included
   * in the default ElicitSlot LexResult.
   */
  promptMessage: string;
  /**
   * The Slot name with which this evaluator is associated
   */
  slotName: string;
  /**
   * A function that evaluates whether the Slot value or originalValue/resolutions are valid.
   * In general, implementations are free to decide what evaluate means.
   */
  evaluate: (lexEvent: Ext.LexEvent) => SlotEvaluationResult;
  /**
   * A function that returns an assessment of validity.
   */
  isValid: (param: EvaluatableSlotValue) => SlotValidationAssessment;
}


/**
 * Slots are not valid or invalid. However, the DefaultDialogEventHandler does make a distinction as to
 * whether or not it is the current or recent slot (from the recentIntentSummary view) that is valid.  This
 * is explained in more detail below.
 */
export enum SlotValidationAssessment {
  INVALID = 1,
  VALID_SLOT,
  VALID_RECENT_SLOT
}


/**
 * All the data necessary to evaluate the validity of a Slot value is encompassed by implementations of this interface.
 */
export interface EvaluatableSlotValue { 
  value: string;
  recentValue?: string;
  details: { resolutions: LexSlotResolution[]; originalValue: string; };
  elicitedSlotName?: string;
}


/**
 * The result of SlotEvaluator evaluation.
 */
export class SlotEvaluationResult {
  valid: SlotValidationAssessment;
  slotValue: EvaluatableSlotValue;
  /**
   * If a SlotEvaluator determines that a Slot value should be something other than
   * what is determined by Lex itself, that value can be specified here.
   */
  newSlots?: { [name: string]: string };

  constructor(v: SlotValidationAssessment, s: EvaluatableSlotValue, n?: { [name: string]: string }) {
    this.valid = v;
    this.slotValue = s;
    if (n) this.newSlots = n;
  }

}


/**
 * A specific implementation of an EventHandler dedicated to Dialog.
 *
 * You don't have to use this ... you can create your own Implementation of
 * EventHandler if you like. 
 * 
 * The strategy employed by this implementation cycles thru Slot values and evaluates
 * each.  Evaluation includes but is not necessarily limited to assessing validity.  
 * If an invalid Slot is found, a LexResult message is generated (by default an
 * ElicitSlot dialog action).
 * 
 * If all Slots are valid, then a LexResult message is generated (by default a delegate
 * dialog action).
 *
 */
export class DefaultDialogEventHandler implements EventHandler {
  /**
   * map SlotEvaluator instances to slot name to make it easier to cycle thru the slots
   */
  protected slotEvaluatorMap: { [slotName: string]: SlotEvaluator };
  
  /**
   * this array defines the order in which Slots will be elicited
   */
  protected slotNameArray: string[] = [];

  /**
   * configuration which parameterizes dialog handling by this class.
   */
  protected config: DialogEventHandlerConfig;
  
  /**
   * By default, ElicitSlot with a prompt message when an invalid slot is encountered.
   *  
   * @param lexEvent 
   * @param slotEvaluator 
   * @param slotEvalResult 
   */
  protected defaultInvalidSlotResponder = (lexEvent: Ext.LexEvent, slotEvaluator: SlotEvaluator, 
    slotEvalResult: SlotEvaluationResult): Ext.LexResult => {
    return LexResultFactory.dialogActionElicitSlot({
      intentName: lexEvent.currentIntent.name,
      slotToElicit: slotEvaluator.slotName,
      slots: lexEvent.currentIntent.slots,
      message: { content: slotEvaluator.promptMessage, contentType: 'PlainText' },
      sessionAttributes: lexEvent.sessionAttributes
    });
  }

  /**
   * Delegate by default when all Slot values are valid.
   * 
   * @param lexEvent 
   */
  protected defaultAllSlotsValidResponder = (lexEvent: Ext.LexEvent): Ext.LexResult =>{
    return LexResultFactory.dialogActionDelegate({
      slots: lexEvent.currentIntent.slots,
      sessionAttributes: lexEvent.sessionAttributes
    });
  }

  constructor(config: DialogEventHandlerConfig) {
      /**
       * just reading this config
       */
      this.config = config;
      /**
       * use provided List (Array) of SlotValidators to
       * create a Mapping of those Evaluators to their corresponding
       * Slot naames.  This is done for convenience during Slot
       * valuation
       */
      this.slotEvaluatorMap = {};
      this.config.slotEvaluatorArray.forEach((se) => {
        this.slotEvaluatorMap[se.slotName] = se;
        this.slotNameArray.push(se.slotName);
      });
  }


  /**
   * Cycles thru Slot values one at a time.  Evaluates each Slot using the configured
   * SlotEvalator.  An appropriate LexResult is returned to signify either a Slot value
   * was determined to be invalid, or all Slot values are valid. 
   * 
   * @param lexEvent 
   */
  public handle(lexEvent: Ext.LexEvent): Promise<Ext.LexResult> {
    //
    // iterate over the slot keys ... each key is a slot name ... in desired order
    for (const slotName of this.slotNameArray) {
      const slotEvaluator: SlotEvaluator = this.getSlotEvaluator(slotName);
      //
      // ... evaluate
      const se: SlotEvaluationResult = slotEvaluator.evaluate(lexEvent);
      //
      // if there's a slot evaluation hook, then invoke it
      if (this.config.slotEvaluationHook)
        this.config.slotEvaluationHook(lexEvent, slotEvaluator, se);
      
      //
      // ... if invalid, then return
      if (se.valid === SlotValidationAssessment.INVALID) {
        lexEvent.currentIntent.slots[slotName] = null;
        if (this.config.invalidSlotResponder)
          return Promise.resolve(this.config.invalidSlotResponder(lexEvent, slotEvaluator, se));
        
        return Promise.resolve(this.defaultInvalidSlotResponder(lexEvent, slotEvaluator, se));
      }
    }

    //
    // if there's a hook, invoke it.
    if (this.config.allSlotsValidHook)
      this.config.allSlotsValidHook(lexEvent);

    //
    // if all slots are valid, then delegate back to Lex
    if (this.config.allSlotsValidResponder)
      return Promise.resolve(this.config.allSlotsValidResponder(lexEvent));
    
    return Promise.resolve(this.defaultAllSlotsValidResponder(lexEvent));
  
  }


  /**
   * A helper function that returns data necessary to evaluate a Slot.
   * 
   * @param slotName 
   */
  protected getSlotEvaluator(slotName: string): SlotEvaluator {
    // look for a SlotEvaluator for slotName
    let slotEvaluator = this.slotEvaluatorMap[slotName];

    //
    // if no SlotEvaluator found...
    if (!slotEvaluator) {
      //
      // ... then log something, and map a simple evaluator to it.
      console.log(`::handle(..) .. no SlotEvaluator found for ${slotName} ... will use NotNullSlotEvaluator`);
      slotEvaluator = new StandardSlotEvaluators.NotNullSlotEvaluator(slotName, 'null value is invalid');
      this.slotEvaluatorMap[slotName] = slotEvaluator;
    }

    return slotEvaluator;
  }

}


/**
 * A collection of re-usable SlotEvalutors
 */
export namespace StandardSlotEvaluators {


  /**
   * An abstract Evaluator of a single Slot value that can be sub-classed.
   */
  export abstract class BaseSlotEvaluator implements SlotEvaluator {
    slotName: string;
    promptMessage: string;

    /**
     * 
     * @param sn - Slot name 
     * @param pm  - Prompt message that can be used to Elicit a Slot.
     */
    constructor(sn: string, pm: string) {
      this.slotName = sn;
      this.promptMessage = pm;
    }


    /**
     * The default implementation uses the isValid function property to determine
     * if the Slot filled by user via Lex is valid.  If so, success is returned.
     * Otherwise, the originalValue specified by the user is evaluated.  If this is
     * determined to be valid (using the same function property), then the SlotEvaluationResult
     * will identify the originalValue as the new Slot value.
     *
     * If an original value was not specified or is invalid, then a fail SlotEvalutionResult
     * is returned.
     *
     * @param lexEvent
     */
    public evaluate(lexEvent: Ext.LexEvent): SlotEvaluationResult {
      const slotValue: EvaluatableSlotValue = this.getSlotValue(lexEvent);
      const va: SlotValidationAssessment = this.isValid(slotValue);
      return new SlotEvaluationResult(va, slotValue);
    }


     /**
      * Returns VALID_RECENT_SLOT if the recentIntentSummaryView contains a non-null value
      * for the slot.  Otherwise, returns INVALID.  Therefore, sub-classes must further define
      * what constitutes VALID for themselves.
      * 
      * @param slotValue
      */
    public isValid(slotValue: EvaluatableSlotValue): SlotValidationAssessment {

      /**
       * assume that if the recentIntentSummary view of the slot not null, then it has been previously validated. 
       */
      if (slotValue.recentValue != null) return SlotValidationAssessment.VALID_RECENT_SLOT;
      
      return SlotValidationAssessment.INVALID;

    }

    
    /**
     * Returns Slot value data necessary to evaluate validity 
     * 
     * @param lexEvent 
     */
    protected getSlotValue(lexEvent: Ext.LexEvent): EvaluatableSlotValue {

      const recentIntentSummary: IntentSummary = this.getRecentIntentSummary(lexEvent);

      return {
        value: lexEvent.currentIntent.slots[this.slotName],
        details: lexEvent.currentIntent.slotDetails[this.slotName],
        recentValue: (recentIntentSummary ? recentIntentSummary.slots[this.slotName] : null),
        elicitedSlotName: (recentIntentSummary ? recentIntentSummary.slotToElicit : null)
      };

    }


    /**
     * Find the most recentIntentSummaryView for the current Intent.  If none found, return null.
     * 
     * @param lexEvent 
     */
    protected getRecentIntentSummary(lexEvent: Ext.LexEvent): IntentSummary {

      if (!(lexEvent.recentIntentSummaryView)) {
        return null;
      }

      for (const is of lexEvent.recentIntentSummaryView) {
          if (is.intentName === lexEvent.currentIntent.name) {
            return is;
          }
      }

      return null;

    }

  }


  /**
   * Ensure that Slot value is not null.  Simple.
   */
  export class NotNullSlotEvaluator extends BaseSlotEvaluator {

    /**
     * Returns VALID_SLOT if the slot value is truthy; INVALID if not.  Returns VALID_RECENT_SLOT
     * if super-class isValid method returns so.
     * 
     * @param slotValue 
     */
    public isValid(slotValue: EvaluatableSlotValue): SlotValidationAssessment {
      const sva: SlotValidationAssessment = super.isValid(slotValue);
      if (sva === SlotValidationAssessment.INVALID) {
        return (slotValue.value ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID);
      }
      return sva;
    }

  }

  
  /**
   * Ensure that whatever value was specified exists as is within a Set
   * provided to the constructor.
   *
   */
  export class SetMembershipSlotEvaluator extends BaseSlotEvaluator {
    private set: Set<string>;

    constructor(slotName: string, promptMessage: string, s: Set<string>) {
      super(slotName, promptMessage);
      this.set = s;
    }

    /**
     * Returns VALID_SLOT if slotValue exists within Set.
     * 
     * @param slotValue 
     */
    public isValid(slotValue: EvaluatableSlotValue): SlotValidationAssessment {
      const sva: SlotValidationAssessment = super.isValid(slotValue);
      if (sva === SlotValidationAssessment.INVALID) {
        return (this.set.has(slotValue.value) ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID);
      }
      return sva;
    }

  }


  /**
   * Ensure that a LexDate is valid.  Depending on Slot Type defined within the Lex
   * Intent, this maybe redundant, e.g. with AMAZON.Date type, Lex will ensure value is valid.
   */
  export class LexDateSlotEvaluator extends BaseSlotEvaluator {

    /**
     * 
     * @param slotValue 
     */
    public isValid(slotValue: EvaluatableSlotValue): SlotValidationAssessment {
      const sva: SlotValidationAssessment = super.isValid(slotValue);
      if (sva === SlotValidationAssessment.INVALID) {
        return (Util.isValidLexDate(slotValue.value) 
          ? SlotValidationAssessment.VALID_SLOT 
          : SlotValidationAssessment.INVALID);
      }
      return sva;
    }

  }


  /**
   * Ensure that a currency value is valid.  Depending on Slot Type defined within the Lex
   * Intent, this maybe redundant.
   */
  export class CurrencySlotEvaluator extends BaseSlotEvaluator {
    
    /**
     * Returns VALID_SLOT if string value looks like dollars and cents, i.e.
     * integer, decimal, 2 digits after decimal.  Commas not supported.  Weak. 
     * 
     * @param slotValue 
     */
    public isValid(slotValue: EvaluatableSlotValue): SlotValidationAssessment {
      const sva: SlotValidationAssessment = super.isValid(slotValue);
      if (sva === SlotValidationAssessment.INVALID) {
        const re = new RegExp('^[1-9]?[0-9]*[.][0-9]{2}');
        return (re.test(slotValue.value) ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID);
      }
      return sva;
    }
  }

}


export class Util {
  /**
   * Is a date (YYYY-MM-DD) valid?
   *
   * @param dateString
   */
  public static isValidLexDate = (dateString: string): boolean => {
    if (!(dateString)) return false;
    
    const posn = dateString.lastIndexOf('-');
    if (posn < 0) {
      return false;
    }

    //
    // validate a date.  see: https://medium.com/@esganzerla/simple-date-validation-with-javascript-caea0f71883c
    const date = new Date(`${dateString}T00:00:00`);
    const isValidDate = Boolean(+date) && date.getDate() === +dateString.substring(posn + 1);

    return isValidDate;
  };
}


/**
 * Creates LexResult messages
 */
export class LexResultFactory {
  /**
   * Creates a LexResult with dialog action message with type = Close.
   * 
   * @param param 
   */
  public static dialogActionClose = (param: {
    fulfillmentState: 'Fulfilled' | 'Failed';
    message?: ResponseMessage;
    sessionAttributes?: { [key: string]: string };
    recentIntentSummaryView?: IntentSummary[];
  }): Ext.LexResult => {
    const dac: LexDialogActionClose = {
      type: 'Close',
      fulfillmentState: param.fulfillmentState,
    };

    const lr: Ext.LexResult = {
      dialogAction: dac,
    };

    if (param.message) dac.message = param.message;

    LexResultFactory.maybeAddToResult({
      lexResult: lr,
      sessionAttributes: param.sessionAttributes,
      recentIntentSummaryView: param.recentIntentSummaryView,
    });

    return lr;
  };

  
  /**
   * LexResult with dialog action type = Delegate
   * 
   * @param param 
   */
  public static dialogActionDelegate = (param: {
    slots?: { [name: string]: string | null };
    sessionAttributes?: { [key: string]: string };
    recentIntentSummaryView?: IntentSummary[];
  }): Ext.LexResult => {
    const dad: LexDialogActionDelegate = {
      type: 'Delegate',
      slots: param.slots,
    };

    const lr: Ext.LexResult = {
      dialogAction: dad,
    };

    LexResultFactory.maybeAddToResult({
      lexResult: lr,
      sessionAttributes: param.sessionAttributes,
      recentIntentSummaryView: param.recentIntentSummaryView,
    });

    return lr;
  };


  /**
   * LexResult with ElicitSlot
   * 
   * @param param 
   */
  public static dialogActionElicitSlot = (param: {
    intentName: string;
    slotToElicit: string;
    slots: { [name: string]: string | null };
    message?: ResponseMessage;
    sessionAttributes?: { [key: string]: string };
    recentIntentSummaryView?: IntentSummary[];
  }): Ext.LexResult => {
    const daes: LexDialogActionElicitSlot = {
      type: 'ElicitSlot',
      intentName: param.intentName,
      slots: param.slots,
      slotToElicit: param.slotToElicit,
    };

    const lr: Ext.LexResult = {
      dialogAction: daes,
    };

    if (param.message) daes.message = param.message;

    LexResultFactory.maybeAddToResult({
      lexResult: lr,
      sessionAttributes: param.sessionAttributes,
      recentIntentSummaryView: param.recentIntentSummaryView,
    });

    return lr;
  };


  /**
   * Utility method with arguable benefit to clients.
   * 
   * @param param 
   */
  public static maybeAddToResult = (param: {
    lexResult: Ext.LexResult;
    sessionAttributes?: { [key: string]: string };
    recentIntentSummaryView?: IntentSummary[];
  }): void => {
    if (param.sessionAttributes) param.lexResult.sessionAttributes = param.sessionAttributes;
    if (param.recentIntentSummaryView) param.lexResult.recentIntentSummaryView = param.recentIntentSummaryView;
  }
}
