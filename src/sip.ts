import * as WebSocket from 'ws';
(global as any).WebSocket = WebSocket
import SessionDescriptionHandler from './SessionDescriptionHandler';
import { sip } from 'sip';
import { proxy } from 'sip/proxy';

async function setupProxy() {
    proxy.start({
            logger: {
                recv: function (m) {
                    console.log('recv:' + JSON.stringify(m));
                },
                send: function (m) {
                    console.log('send:' + JSON.stringify(m));
                },
                error: function (e) {
                    console.log(e.stack);
                }
            },
            publicAddress: '192.168.18.55',
        }, function (rq) {
            var user = sip.parseUri(rq.uri).user
            var rs = sip.makeResponse(rq, 200, 'Ok');
            proxy.send(rs);
        }
    )
}