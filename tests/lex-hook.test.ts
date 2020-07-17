import { LexDialogActionClose } from 'aws-lambda';

import { 
    LexEventHandler,
    Ext,
    route, 
    LexResultFactory } from '../src/index';

/**
 * Create a handler to handle LexEvent messages
 */
const lexEventHandler: LexEventHandler = {

    /**
     * No need for any dialog
     */
    dialog: null,

    /**
     * Simplest fulfillment handler possible
     */
    fulfill: {
        handle: (lexEvent: Ext.LexEvent): Promise<Ext.LexResult> => {
            return Promise.resolve(LexResultFactory.dialogActionClose({
                fulfillmentState: 'Fulfilled'
            }));
        }
    } 
    
};

test('test case 1', async () => {
    
    const testLexEvent: Ext.LexEvent = {
        currentIntent: {
            name: 'test',
            slots: { 
                "test_slot": "zamboni"
            },
            slotDetails: {
                "test_slot": {
                    resolutions: [ { value: 'zamboni' } ],
                    originalValue: "i want to ride the zamboni"
                }
            },
            confirmationStatus: 'Confirmed'
        },
        bot: {
            name: 'TestBot',
            alias: '$LATEST',
            version: '$LATEST'
        },
        userId: '123',
        inputTranscript: 'i want to ride the zamboni',
        invocationSource: 'FulfillmentCodeHook',
        outputDialogMode: 'Text',
        messageVersion: '1.0',
        sessionAttributes: {},
        requestAttributes: null,
        recentIntentSummaryView: null,
        sentimentResponse: null,
        kendraResponse: null
    };

    /**
     * invoke the library's route function, and get a LexResult.  Ensure the LexResult instance has the 
     * expected state.
     */
    const r: Ext.LexResult = await route(<Ext.LexEvent>testLexEvent, null, lexEventHandler);
    expect(r.dialogAction.type).toBe('Close');
    expect((r.dialogAction as LexDialogActionClose).fulfillmentState).toBe('Fulfilled');   
    
});