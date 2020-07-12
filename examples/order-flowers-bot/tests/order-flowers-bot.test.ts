import { LexDialogActionClose, LexDialogActionElicitSlot } from 'aws-lambda';
import { Ext, IntentSummary } from 'lex-hook';
import { handler } from '../src/index';


//
// almost like i need a Lex Simulator!  Send messages to it.  It sends messages to Lambda function I
// want to test.  I need to be able to ensure that the 
// Lex Simulator gets back what I expect from the lambda function.

//
// define LexEvent in it's initial state, i.e. what is sent to Dialog Code Hook when 
// user enters an Intent assocated with their utterance.
const testLexEvent: Ext.LexEvent = {
    currentIntent: {
        name: 'OrderFlowers',
        slots: {
            "FlowerType": null,
            "PickupDate": null,
            "PickupTime": null
        },
        slotDetails: {
            "FlowerType": {
                resolutions: [],
                originalValue: null
            },
            "PickupDate": {
                resolutions: [],
                originalValue: null
            },
            "PickupTime": {
                resolutions: [],
                originalValue: null
            }
        },
        confirmationStatus: 'None'
    },
    bot: {
        name: 'OrderFlowers',
        alias: '$LATEST',
        version: '$LATEST'
    },
    userId: '123',
    inputTranscript: 'I would like to pick up flowers',
    invocationSource: 'DialogCodeHook',
    outputDialogMode: 'Text',
    messageVersion: '1.0',
    sessionAttributes: {},
    requestAttributes: null,
    recentIntentSummaryView: null,
    sentimentResponse: null,
    kendraResponse: null
};


describe('order flowers suite', () => {
   
    test('initialize', async () => {

        console.log('initialize............................................................');
                
        const result = await handler(<Ext.LexEvent>testLexEvent, null);
                
        //
        // ensure elicit slot
        expect(result.dialogAction.type).toBe('ElicitSlot');

        //
        // ensure the right slot is elicited first
        expect((<LexDialogActionElicitSlot>result.dialogAction).slotToElicit).toBe('FlowerType');

        const resultSlots = (<LexDialogActionElicitSlot>result.dialogAction).slots;
        expect(resultSlots.FlowerType).toBeNull();
        expect(resultSlots.PickupDate).toBeNull();
        expect(resultSlots.PickupTime).toBeNull();

    });



    test('submit FlowerType', async () => {

        console.log('submit FlowerType............................................................');
        
        const flowerType = 'roses';
        testLexEvent.inputTranscript = flowerType;
        testLexEvent.currentIntent.slotDetails.FlowerType.originalValue = flowerType;
        testLexEvent.currentIntent.slots.FlowerType = flowerType;

        const intentSummary: IntentSummary = {
            intentName: testLexEvent.currentIntent.name,
            checkpointLabel: null,
            slots:{
                "FlowerType": null,
                "PickupDate": null,
                "PickupTime": null
            },
            confirmationStatus: 'None',
            dialogActionType: 'ElicitSlot',
            fulfillmentState: null,
            slotToElicit: 'FlowerType'
        };

        testLexEvent.recentIntentSummaryView = [ intentSummary ];

        const result = await handler(<Ext.LexEvent>testLexEvent, null);
        expect(result.sessionAttributes['price'] === '2.00');

        //
        // after submitting roses as FlowerType, expect PickupDate will be next Elicited slot
        expect(result.dialogAction.type).toBe('ElicitSlot');
        expect((<LexDialogActionElicitSlot>result.dialogAction).slotToElicit).toBe('PickupDate');
        const resultSlots = (<LexDialogActionElicitSlot>result.dialogAction).slots;
        expect(resultSlots.FlowerType).toBe(flowerType);
        expect(resultSlots.PickupDate).toBeNull();
        expect(resultSlots.PickupTime).toBeNull();

    });


    test('submit PickupDate', async () => {
        console.log('submit PickupDate.............................................................');
        const pickUpDate = '2020-07-06';

        testLexEvent.inputTranscript = pickUpDate;
        testLexEvent.currentIntent.slotDetails.PickupDate.originalValue = pickUpDate;
        testLexEvent.currentIntent.slots.PickupDate = pickUpDate;

        const intentSummary: IntentSummary = {
            intentName: testLexEvent.currentIntent.name,
            checkpointLabel: null,
            slots:{
                "FlowerType": 'roses',
                "PickupDate": null,
                "PickupTime": null
            },
            confirmationStatus: 'None',
            dialogActionType: 'ElicitSlot',
            fulfillmentState: null,
            slotToElicit: 'PickupDate'
        };

        testLexEvent.recentIntentSummaryView = [ intentSummary ];

        const result = await handler(<Ext.LexEvent>testLexEvent, null);
        
        expect(result.dialogAction.type).toBe('ElicitSlot');
        expect((<LexDialogActionElicitSlot>result.dialogAction).slotToElicit).toBe('PickupTime');
        const resultSlots = (<LexDialogActionElicitSlot>result.dialogAction).slots;
        expect(resultSlots.PickupDate).toBe(pickUpDate);
        expect(resultSlots.PickupTime).toBeNull();

    });


    test('submit PickupTime', async () => {
        console.log('submit PickupTime.............................................................');
        const pickUpTime = '17:00:00';

        testLexEvent.inputTranscript = pickUpTime;
        testLexEvent.currentIntent.slotDetails.PickupTime.originalValue = pickUpTime;
        testLexEvent.currentIntent.slots.PickupTime = pickUpTime;

        const intentSummary: IntentSummary = {
            intentName: testLexEvent.currentIntent.name,
            checkpointLabel: null,
            slots:{
                "FlowerType": 'roses',
                "PickupDate": '2020-07-06',
                "PickupTime": null
            },
            confirmationStatus: 'None',
            dialogActionType: 'ElicitSlot',
            fulfillmentState: null,
            slotToElicit: 'PickupTime'
        };

        testLexEvent.recentIntentSummaryView = [ intentSummary ];
        
        const result = await handler(<Ext.LexEvent>testLexEvent, null);
        
        expect(result.dialogAction.type).toBe('Delegate');

        const resultSlots = (<LexDialogActionElicitSlot>result.dialogAction).slots;
        expect(resultSlots.PickupTime).toBe(pickUpTime);
        expect(resultSlots.PickupDate).toBeTruthy();
        expect(resultSlots.FlowerType).toBeTruthy();

    });


    test('notify confirm fulfillment', async () => {
        console.log('notifying confirm fulfillment.............................................................');
        
        const intentSummary: IntentSummary = {
            intentName: testLexEvent.currentIntent.name,
            checkpointLabel: null,
            slots:{
                "FlowerType": 'roses',
                "PickupDate": '2020-07-06',
                "PickupTime": '17:00:00'
            },
            confirmationStatus: 'None',
            dialogActionType: 'ElicitSlot',
            fulfillmentState: null,
            slotToElicit: 'PickupTime'
        };
        testLexEvent.recentIntentSummaryView = [ intentSummary ];

        const result = await handler(<Ext.LexEvent>testLexEvent, null);

        expect(result.dialogAction.type).toBe('Delegate');

    });


    test('fulfillment', async () => {
        console.log('fulfill.............................................................');
        
        testLexEvent.invocationSource = 'FulfillmentCodeHook';
        testLexEvent.currentIntent.confirmationStatus = 'Confirmed';
        testLexEvent.inputTranscript = 'yes';
        testLexEvent.recentIntentSummaryView = null;

        const result = await handler(<Ext.LexEvent>testLexEvent, null);

        expect(result.dialogAction.type).toBe('Close');
        expect((<LexDialogActionClose>result.dialogAction).fulfillmentState).toBe('Fulfilled');
       
    });


});


