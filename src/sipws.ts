import { WebSocketInterface, UA } from "jssip"

let socket = new WebSocketInterface('wss://192.168.16.53:5060')
let configuration = {
    sockets: [socket],
    uri: 'sip:02836222777@192.168.16.53:5060'
}

let ua = new UA(configuration);
ua.on('connected', function (e) {
    console.log("WS connected")
});
