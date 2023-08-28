import * as WebSocket from 'ws';

(global as any).WebSocket = WebSocket
import SessionDescriptionHandler from './SessionDescriptionHandler';
import {sip} from 'sip';
import {proxy} from 'sip/proxy';

export function setupProxy() {
   
}