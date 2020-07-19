import { Context } from 'aws-lambda';
import { LexHook as lx } from 'lex-hook';

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
export async function handler(lexEvent: lx.LexEvent, ctx: Context): Promise<lx.LexResult> {
    return lx.route(<lx.LexEvent>lexEvent, ctx, intent.eventHandler);
}
