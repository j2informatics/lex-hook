import { Context } from 'aws-lambda';
import { route, Ext } from 'lex-hook';

import * as intent from './order-flowers-intent';

export async function handler(lexEvent: Ext.LexEvent, ctx: Context): Promise<Ext.LexResult> {
    return route(<Ext.LexEvent>lexEvent, ctx, intent.eventHandler);
}
