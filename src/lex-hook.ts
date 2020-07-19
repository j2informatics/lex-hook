import { 
  LexEvent as AWSLexEvent, 
  LexResult as AWSLexResult, 
  Context,
  LexDialogActionClose,
  LexDialogActionDelegate,
  LexDialogActionElicitSlot } from 'aws-lambda';

export interface LexEvent extends AWSLexEvent {
  recentIntentSummaryView: IntentSummary[];
  sentimentResponse: {
    SentimentScore: {
      Mixed: number;
      Positive: number;
      Neutral: number;
      Negative: number;
    };
    SentimentLabel: string;
  };
  kendraResponse: string;
}

/**
 * LexResult objects can contain a recentIntentSummaryView
 */
export interface LexResult extends AWSLexResult {
  recentIntentSummaryView?: IntentSummary[];
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
  handle: (lexEvent: LexEvent) => Promise<LexResult>;
}



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
export const route = async (lexEvent: LexEvent, ctx: Context, eventHandler: LexEventHandler): Promise<LexResult> => {
  console.info('::route(:LexEvent, ..).. ');
  console.log(JSON.stringify(lexEvent));

  try {
    if (lexEvent.invocationSource === 'DialogCodeHook') {
      const r: LexResult = await eventHandler.dialog.handle(lexEvent);
      return r;
    }

    if (lexEvent.invocationSource === 'FulfillmentCodeHook') {
      const r: LexResult = await eventHandler.fulfill.handle(lexEvent);
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
        sessionAttributes: lexEvent.sessionAttributes,
      }),
    );
  }
};


export class Util {
  /**
   * Is a date (YYYY-MM-DD) valid?
   *
   * @param dateString
   */
  public static isValidLexDate = (dateString: string): boolean => {
    if (!dateString) return false;

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
  }): LexResult => {
    const dac: LexDialogActionClose = {
      type: 'Close',
      fulfillmentState: param.fulfillmentState,
    };

    const lr: LexResult = {
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
  }): LexResult => {
    const dad: LexDialogActionDelegate = {
      type: 'Delegate',
      slots: param.slots,
    };

    const lr: LexResult = {
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
  }): LexResult => {
    const daes: LexDialogActionElicitSlot = {
      type: 'ElicitSlot',
      intentName: param.intentName,
      slots: param.slots,
      slotToElicit: param.slotToElicit,
    };

    const lr: LexResult = {
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
    lexResult: LexResult;
    sessionAttributes?: { [key: string]: string };
    recentIntentSummaryView?: IntentSummary[];
  }): void => {
    if (param.sessionAttributes) param.lexResult.sessionAttributes = param.sessionAttributes;
    if (param.recentIntentSummaryView) param.lexResult.recentIntentSummaryView = param.recentIntentSummaryView;
  };
}
