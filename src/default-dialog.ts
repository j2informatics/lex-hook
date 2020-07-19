import { LexSlotResolution } from 'aws-lambda';
import { LexEvent, LexResult, EventHandler, IntentSummary, LexResultFactory, Util } from './lex-hook';

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
  slotEvaluationHook?: (lexEvent: LexEvent, slotEvaluator: SlotEvaluator, slotEvalResult: SlotEvaluationResult) => void;
  /**
   * Optional hook function invoked when all Slot values are determined to be valid.
   */
  allSlotsValidHook?: (lexEvent: LexEvent) => void;
  /**
   * An optional function.  If specified, will be used to generate an appropriate Lex result when an invalid
   * Slot value is found.  If not specified, the DefaultDialogEventHandler will return an ElicitSlot dialog action
   * message.
   */
  invalidSlotResponder?: (
    lexEvent: LexEvent,
    slotEvaluator: SlotEvaluator,
    slotEvalResult: SlotEvaluationResult,
  ) => LexResult;
  /**
   * An optional function.  If specified, will be used to generate an appropriate Lex result when all Slot values
   * are assessed as valid.  If not specified, the DefaultDialogEventHandler will return a Delegate dialog
   * action message.
   */
  allSlotsValidResponder?: (lexEvent: LexEvent) => LexResult;
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
  evaluate: (lexEvent: LexEvent) => SlotEvaluationResult;
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
  VALID_RECENT_SLOT,
}

/**
 * All the data necessary to evaluate the validity of a Slot value is encompassed by implementations of this interface.
 */
export interface EvaluatableSlotValue {
  value: string;
  recentValue?: string;
  details: { resolutions: LexSlotResolution[]; originalValue: string };
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
  protected defaultInvalidSlotResponder = (
    lexEvent: LexEvent,
    slotEvaluator: SlotEvaluator,
    slotEvalResult: SlotEvaluationResult,
  ): LexResult => {
    return LexResultFactory.dialogActionElicitSlot({
      intentName: lexEvent.currentIntent.name,
      slotToElicit: slotEvaluator.slotName,
      slots: lexEvent.currentIntent.slots,
      message: { content: slotEvaluator.promptMessage, contentType: 'PlainText' },
      sessionAttributes: lexEvent.sessionAttributes,
    });
  };

  /**
   * Delegate by default when all Slot values are valid.
   *
   * @param lexEvent
   */
  protected defaultAllSlotsValidResponder = (lexEvent: LexEvent): LexResult => {
    return LexResultFactory.dialogActionDelegate({
      slots: lexEvent.currentIntent.slots,
      sessionAttributes: lexEvent.sessionAttributes,
    });
  };

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
  public handle(lexEvent: LexEvent): Promise<LexResult> {
    //
    // iterate over the slot keys ... each key is a slot name ... in desired order
    for (const slotName of this.slotNameArray) {
      const slotEvaluator: SlotEvaluator = this.getSlotEvaluator(slotName);
      //
      // ... evaluate
      const se: SlotEvaluationResult = slotEvaluator.evaluate(lexEvent);
      //
      // if there's a slot evaluation hook, then invoke it
      if (this.config.slotEvaluationHook) this.config.slotEvaluationHook(lexEvent, slotEvaluator, se);

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
    if (this.config.allSlotsValidHook) this.config.allSlotsValidHook(lexEvent);

    //
    // if all slots are valid, then delegate back to Lex
    if (this.config.allSlotsValidResponder) return Promise.resolve(this.config.allSlotsValidResponder(lexEvent));

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
      slotEvaluator = new NotNullSlotEvaluator(slotName, 'null value is invalid');
      this.slotEvaluatorMap[slotName] = slotEvaluator;
    }

    return slotEvaluator;
  }
}

/**
 * A collection of re-usable SlotEvalutors
 */
// export namespace StandardSlotEvaluators {

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
  public evaluate(lexEvent: LexEvent): SlotEvaluationResult {
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
  protected getSlotValue(lexEvent: LexEvent): EvaluatableSlotValue {
    const recentIntentSummary: IntentSummary = this.getRecentIntentSummary(lexEvent);

    return {
      value: lexEvent.currentIntent.slots[this.slotName],
      details: lexEvent.currentIntent.slotDetails[this.slotName],
      recentValue: recentIntentSummary ? recentIntentSummary.slots[this.slotName] : null,
      elicitedSlotName: recentIntentSummary ? recentIntentSummary.slotToElicit : null,
    };
  }

  /**
   * Find the most recentIntentSummaryView for the current Intent.  If none found, return null.
   *
   * @param lexEvent
   */
  protected getRecentIntentSummary(lexEvent: LexEvent): IntentSummary {
    if (!lexEvent.recentIntentSummaryView) {
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
      return slotValue.value ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID;
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
      return this.set.has(slotValue.value) ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID;
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
      return Util.isValidLexDate(slotValue.value)
        ? SlotValidationAssessment.VALID_SLOT
        : SlotValidationAssessment.INVALID;
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
      return re.test(slotValue.value) ? SlotValidationAssessment.VALID_SLOT : SlotValidationAssessment.INVALID;
    }
    return sva;
  }
}

// }
