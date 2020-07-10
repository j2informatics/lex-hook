import { LexDialogActionClose } from 'aws-lambda';

import { 
    LexEventHandler,
    Ext,
    route, 
    LexResultFactory } from '../src/index';

const lexEventHandler: LexEventHandler = {

    dialog: null,

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
        recentIntentSummaryView: null
    };

    const r: Ext.LexResult = await route(<Ext.LexEvent>testLexEvent, null, lexEventHandler);
    expect(r.dialogAction.type).toBe('Close');
    expect((<LexDialogActionClose>r.dialogAction).fulfillmentState).toBe('Fulfilled');   
    
});