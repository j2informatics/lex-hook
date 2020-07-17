import { Context } from 'aws-lambda';
import { route, Ext } from 'lex-hook';

/**
 * The LexEventHandler is defined within this module.
 */
import * as intent from './order-flowers-intent';

/**
 * This is the entry point for the lambda code-hook function.
 * 
 * @param lexEvent
 * @param ctx 
 */
export async function handler(lexEvent: Ext.LexEvent, ctx: Context): Promise<Ext.LexResult> {
    return route(<Ext.LexEvent>lexEvent, ctx, intent.eventHandler);
}
