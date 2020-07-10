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
 * Extend some of the AWS-defined types
 */
export namespace Ext {

  export interface LexEvent extends AWSLexEvent {
    recentIntentSummaryView: IntentSummary[];
  }
  
  export interface LexResult extends AWSLexResult {
    recentIntentSummaryView?: IntentSummary[];
  }

}

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
 * Each LexEvent is specific to either Dialog or Fulfillment.  The route function evalutes invocation source
 * to determine which it is and then delegates to the appropriate LexEventHandler implementation.
 *
 * @param lexEvent
 * @param ctx
 * @param eventHandler
 */
export const route = async (lexEvent: Ext.LexEvent, ctx: Context, eventHandler: LexEventHandler)
: Promise<Ext.LexResult> => {
  console.info('::route(:LexEvent, ..)..');
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
 * Lex-provided messages are processed by implementations of this interface.
 *
 * There are 2 operations that must be accounted for: dialog and fulfillment.
 * The dialog operation is invoked when a user submits text to Lex while their session is
 * associated with an Intent with which this handler
 * is associated.   Fulfillment occurs when a user has "filled all slots", and the Intent
 * is therefore ready to be fulfilled.
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


export interface DialogEventHandlerConfig {
  /**
   * List of SlotValidators ... one for each Slot
   */
  slotEvaluatorArray: SlotEvaluator[];
  /**
   * an optional hook function invoked after a Slot is evaluated.  The function is invoked whether the Slot 
   * value is valid or not.
   */
  slotEvaluationHook?: (lexEvent: Ext.LexEvent, slotEvaluator: SlotEvaluator, 
    slotEvalResult: SlotEvaluationResult) => void;
  /**
   * optional hook function invoked when all Slot values are valid.
   */
  allSlotsValidHook?: (lexEvent: Ext.LexEvent) => void;
  /**
   * An optional function.  If specified, will be used to generate an appropriate Lex result when an invalid
   * Slot value is found.
   */
  invalidSlotResponder?: (lexEvent: Ext.LexEvent, slotEvaluator: SlotEvaluator, 
    slotEvalResult: SlotEvaluationResult) => Ext.LexResult;
  /**
   * An optional function.  If specified, will be used to generate an appropriate Lex result when all Slot values
   * are assessed as valid.
   */
  allSlotsValidResponder?: (lexEvent: Ext.LexEvent) => Ext.LexResult;
}


/**
 * A specific implementation of an EventHandler dedicated to Dialog handling.
 *
 * You don't have to use this ... you can create your own sub-class of BaseDialogEventHandler
 * or sub-class the DefaultDialogEventHandler if you like. *
 *
 * Anyway, this implementation expects an array of SlotEvaluator instances -- one for each Slot.
 * On each Lex-provided event, slot values will be evalated by the specified SlotEvaluator.
 *
 * If a SlotEvaluator determines that a Slot Value is invalid, then an ElicitSlot message
 * is sent back to Lex.  Conversely, if all Slots are vaild, then a Delegate message
 * is sent back to Lex with the expectation that Lex will confirm with the user
 * that the Intent should be fulfilled, and if so, Lex will susequently send
 * a Fulfillment Event.
 *
 */
export class DefaultDialogEventHandler implements EventHandler {
  //
  // map SlotEvaluator instances to slot name to make it easier to cycle thru the slots
  protected slotEvaluatorMap: { [slotName: string]: SlotEvaluator };

  //
  // this array defines the order in which Slots will be elicited
  protected slotNameArray: string[] = [];

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
   * Delegate by default.
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
        //
        // just reading this config
        this.config = config;
        //
        // use provided List (Array) of SlotValidators to 
        // create a Mapping of those Evaluators to their corresponding
        // Slot noames.
        this.slotEvaluatorMap = {};
        this.config.slotEvaluatorArray.forEach((se) => {
          this.slotEvaluatorMap[se.slotName] = se;
          this.slotNameArray.push(se.slotName);
        }
    );

  }


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
    // if all slots are valid, then delegate back to Lex ... which will send a Fulfillment Event.
    if (this.config.allSlotsValidResponder)
      return Promise.resolve(this.config.allSlotsValidResponder(lexEvent));
    
    return Promise.resolve(this.defaultAllSlotsValidResponder(lexEvent));
  
  };


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
 * The DefaultDialogEventHandler expects that each Slot has a SlotEvaluator instance mapped to it.
 */
export interface SlotEvaluator {
  //
  // if the evaluate function determines the Slot value is invalid, the failMessage will be included
  // in the ElicitSlot message.
  promptMessage: string;
  //
  // the Slot name with which this evaluator is associated
  slotName: string;
  //
  // a function that evaluates whether the Slot value or originalValue/resolution are value.
  // in general, implementations are free to decide what evaluate means.
  evaluate: (lexEvent: Ext.LexEvent) => SlotEvaluationResult;
  //
  // a function that returns true if the implementation determines the Slot value is valid.
  isValid: (param: EvaluatableSlotValue) => SlotValidationAssessment;
  //
  // a function to get the slot value to evaluate.  The value is returned as well
  // a boolean to indicate if the value was previously validated (as determined
  // by the implementation of this function).
  getSlotValue: (lexEvent: Ext.LexEvent) => EvaluatableSlotValue;
}


export enum SlotValidationAssessment {
  INVALID = 1,
  VALID_SLOT,
  VALID_RECENT_SLOT
}


export interface EvaluatableSlotValue { 
  value: string;
  recentValue?: string;
  details: { resolutions: LexSlotResolution[]; originalValue: string; };
  elicitedSlotName?: string;
}

/**
 * The result of SlotEvaluator evaluation.
 * 
 */
export class SlotEvaluationResult {
  //
  //
  valid: SlotValidationAssessment;
  //
  //
  slotValue: EvaluatableSlotValue;
  //
  // If a SlotEvaluator determines that a value should be something other than
  // what is determined by Lex itself, a Slot value can be specified here.
  newSlots?: { [name: string]: string };

  constructor(v: SlotValidationAssessment, s: EvaluatableSlotValue, n?: { [name: string]: string }) {
    this.valid = v;
    this.slotValue = s;
    if (n) this.newSlots = n;
  }

}

/**
 * A collection of re-usable SlotEvalutors
 */
export namespace StandardSlotEvaluators {
  /**
   * An abstract Evaluator of a single slot that can be sub-classed.
   */
  export abstract class BaseSlotEvaluator implements SlotEvaluator {
    slotName: string;
    promptMessage: string;

    constructor(sn: string, fm: string) {
      this.slotName = sn;
      this.promptMessage = fm;
    }

    /**
     * The default implementation always returns true.  The definition of valid should be defined
     * by sub-classes.
     *
     * @param slotValue
     */
    public isValid(slotValue: EvaluatableSlotValue): SlotValidationAssessment {
      
      //
      // assume a null slot value is always invalid
      if (!(slotValue.value)) return SlotValidationAssessment.INVALID;
      
      //
      // assume that if the recentIntentSummary view of the slot not null, then it has been previously validated.
      if (slotValue.recentValue != null) return SlotValidationAssessment.VALID_RECENT_SLOT;

      return SlotValidationAssessment.INVALID;
    };

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
    };


    /**
     * 
     * @param lexEvent 
     */
    public getSlotValue(lexEvent: Ext.LexEvent): EvaluatableSlotValue {
      //
      // if there is a recentIntentSummaryView...
      const recentIntentSummary: IntentSummary = this.getRecentIntentSummary(lexEvent);

      return {
        value: lexEvent.currentIntent.slots[this.slotName],
        details: lexEvent.currentIntent.slotDetails[this.slotName],
        recentValue: (recentIntentSummary ? recentIntentSummary.slots[this.slotName] : null),
        elicitedSlotName: (recentIntentSummary ? recentIntentSummary.slotToElicit : null)
      };

    };


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

    public isValid(param: EvaluatableSlotValue): SlotValidationAssessment {
      const sva: SlotValidationAssessment = super.isValid(param);
      if (sva === SlotValidationAssessment.INVALID) {
        return (param.value ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID);
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

    constructor(sn: string, fm: string, s: Set<string>) {
      super(sn, fm);
      this.set = s;
    }

    public isValid(param: EvaluatableSlotValue): SlotValidationAssessment {
      const sva: SlotValidationAssessment = super.isValid(param);
      if (sva === SlotValidationAssessment.INVALID) {
        return (this.set.has(param.value) ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID);
      }
      return sva;
    }

  }


  /**
   * Ensure that a LexDate is valid.  Depending on Slot Type defined within the Lex
   * Intent, this maybe redundant.
   */
  export class LexDateSlotEvaluator extends BaseSlotEvaluator {

    public isValid(param: EvaluatableSlotValue): SlotValidationAssessment {
      const sva: SlotValidationAssessment = super.isValid(param);
      if (sva === SlotValidationAssessment.INVALID) {
        return (Util.isValidLexDate(param.value) ? SlotValidationAssessment.VALID_SLOT 
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
    
    public isValid(param: EvaluatableSlotValue): SlotValidationAssessment {
      const sva: SlotValidationAssessment = super.isValid(param);
      if (sva === SlotValidationAssessment.INVALID) {
        const re: RegExp = new RegExp('^[1-9]?[0-9]*[.][0-9]{2}');
        return (re.test(param.value) ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID);
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



export class LexResultFactory {
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

  public static maybeAddToResult = (param: {
    lexResult: Ext.LexResult;
    sessionAttributes?: { [key: string]: string };
    recentIntentSummaryView?: IntentSummary[];
  }): void => {
    if (param.sessionAttributes) param.lexResult.sessionAttributes = param.sessionAttributes;
    if (param.recentIntentSummaryView) param.lexResult.recentIntentSummaryView = param.recentIntentSummaryView;
  }
}
