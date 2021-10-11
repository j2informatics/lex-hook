import { LexDialogActionClose } from 'aws-lambda';
import { 
    LexHook as lx, 
    LexHookDialog as lxd 
}  from '../src/index';


/**
 * Create a handler to handle LexEvent messages
 */
const lexEventHandler:lx.LexEventHandler = {

    dialog: new lxd.DefaultDialogEventHandler({
        slotEvaluatorArray: [
            new lxd.NotNullSlotEvaluator(
                'test_slot', 
                'test slot value?')
        ],
    }),

    /**cl
     * Simplest fulfillment handler possible
     */
    fulfill: {
        handle: (): Promise<lx.LexResult> => {
            return Promise.resolve(lx.LexResultFactory.dialogActionClose({
                fulfillmentState: 'Fulfilled'
            }));
        }
    } 
    
};


describe('test suite', () => {

    test('test case: dialog', async () => {
    
        const testLexEvent: lx.LexEvent = {
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
                confirmationStatus: 'None'
            },
            bot: {
                name: 'TestBot',
                alias: '$LATEST',
                version: '$LATEST'
            },
            userId: '123',
            inputTranscript: 'i want to ride the zamboni',
            invocationSource: 'DialogCodeHook',
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
        const r: lx.LexResult = await lx.route(<lx.LexEvent>testLexEvent, null, lexEventHandler);
        expect(r.dialogAction.type).toBe('Delegate');
        
    });
    
      
    test('test case: fulfill', async () => {
        
        const testLexEvent: lx.LexEvent = {
            currentIntent: {
                name: 'test',
                slots: { 
                    "test_slot": "zamboni"
                },
                slotDetails: {
                    "test_slot": {
                        resolutions: [ { value: 'zamboni' } ],
                        originalValue: ""
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
            inputTranscript: 'yes',
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
        const r: lx.LexResult = await lx.route(<lx.LexEvent>testLexEvent, null, lexEventHandler);
        expect(r.dialogAction.type).toBe('Close');
        expect((r.dialogAction as LexDialogActionClose).fulfillmentState).toBe('Fulfilled');   
        
    });

})

