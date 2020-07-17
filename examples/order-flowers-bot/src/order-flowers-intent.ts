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

    /**
     * Set the price of flowers as a function of type
     */
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
        /**
         * Custom Slot Type (Expand Values) in Lex. 
         */
        new StandardSlotEvaluators.SetMembershipSlotEvaluator(
            'FlowerType', 
            'What type of flowers would you like to order?', 
            new Set<string>(VALID_FLOWER_TYPES)),
        /** 
         * AMAZON.DATE
         * 
         * This is redundant given that Lex will ensure user-entered dates are valid.
         */
        new StandardSlotEvaluators.LexDateSlotEvaluator(
            'PickupDate', 
            'What day do you want the Flowers to be picked up?'),
        /** 
         * AMAZON.TIME
         */
        new StandardSlotEvaluators.NotNullSlotEvaluator(
            'PickupTime', 
            'At what time do you want the Flowers to be picked up?')
    ],
    /**
     * this the specified function is invoked each time a Slot value is evaluated.
     */
    slotEvaluationHook: slotEvalFunction
    
}


export const eventHandler: LexEventHandler = {
    dialog: new DefaultDialogEventHandler(config),
    fulfill: new FulfillmentEventHandler()
}


