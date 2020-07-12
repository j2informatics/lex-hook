import { 
    LexEventHandler,
    DefaultDialogEventHandler, 
    StandardSlotEvaluators,
    EventHandler,
    LexResultFactory,
    Ext,
    SlotEvaluationResult,
    SlotValidationAssessment,
    DialogEventHandlerConfig,
    SlotEvaluator
} from 'lex-hook';

const VALID_FLOWER_TYPES_ARRAY = [
    'roses',
    'tulips',
    'lilies'
]
const VALID_FLOWER_TYPES: Set<string> = new Set(VALID_FLOWER_TYPES_ARRAY);

class FulfillmentEventHandler implements EventHandler {
        
    public handle = (lexEvent: Ext.LexEvent): Promise<Ext.LexResult> => {

        return Promise.resolve(LexResultFactory.dialogActionClose({
            fulfillmentState: 'Fulfilled',
            message: {
                contentType: 'PlainText',
                content: 'Flowers have been ordered'
            }
        }));
    }

}


/**
 * This is invoked each time a Slot value is evaluated 
 * 
 * @param lexEvent 
 * @param slotEvaluator 
 * @param slotEvalResult 
 */
const slotEvalFunction  = (lexEvent: Ext.LexEvent, slotEvaluator: SlotEvaluator, 
    slotEvalResult: SlotEvaluationResult): void => {

    if (slotEvalResult.valid != SlotValidationAssessment.VALID_SLOT)
        return;

    if (slotEvaluator.slotName === 'FlowerType') {
        let price = 2;
        if (slotEvalResult.slotValue.value === 'roses') {
            price = 3;
        }
        lexEvent.sessionAttributes['price'] = price.toString();
    }

}


const config: DialogEventHandlerConfig = {
    slotEvaluatorArray: [
        // Custom Slot Type (Expand Values)
        new StandardSlotEvaluators.SetMembershipSlotEvaluator(
            'FlowerType', 
            'What type of flowers would you like to order?', 
            new Set<string>(VALID_FLOWER_TYPES)),
        // AMAZON.DATE
        new StandardSlotEvaluators.LexDateSlotEvaluator(
            'PickupDate', 
            'What day do you want the Flowers to be picked up?'),
        // AMAZON.TIME
        new StandardSlotEvaluators.NotNullSlotEvaluator(
            'PickupTime', 
            'At what time do you want the Flowers to be picked up?')
    ],
    slotEvaluationHook: slotEvalFunction
    
}


export const eventHandler: LexEventHandler = {

    //
    // specify these in same order slots should be elicited!
    //
    dialog: new DefaultDialogEventHandler(config),
    fulfill: new FulfillmentEventHandler()

}


