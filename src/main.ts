import Call from './Call'
import { getIntentInRoom } from "./store";
import { createAppservice, getOrUploadAvatarUrl } from "./appservice";
import { formatPhoneNumber } from './utils';
import { APPSERVICE_CONFIG, COUNTRY_CODE } from './config';
import { createUserAgent } from './sip';
import { WebSocketInterface, UA }  from 'jssip';


// mapping between Call-IDs and Call instances
const callMapping: {[callId: string]: Call} = {}

let socket = new WebSocketInterface('wss://192.168.16.53:5060')
let configuration = {
    sockets: [socket],
    uri: 'sip:02836222777@192.168.16.53:5060'
}
const userAgent = new UA(configuration);

const appservice = createAppservice(APPSERVICE_CONFIG)

appservice.on("room.event", async (roomId, event) => {

    // is it a event sent by the appservice?
    if(appservice.getSuffixForUserId(event["sender"])) {
        // ignore
        return
    }

    console.log(`Received event ${event["event_id"]} (${event["type"]}) from ${event["sender"]} in ${roomId}`);

    const matrixId = event.sender
    const callId = event.content?.call_id

    // let's find an intent which is able to post in that room
    const intent = await getIntentInRoom(roomId, appservice)
    if(!intent) {
        console.error(`we could not find any way to participate in room ${roomId} after recieving an '${event.tye}' event`)
        return
    }

    let call: Call
    try {
        switch(event["type"]) {

            // Invite to a new call by the matrix user
            case 'm.call.invite':
                const sdp = event.content?.offer?.sdp
                const number = appservice.getSuffixForUserId(intent.userId)
                call = new Call(callId, roomId, intent, userAgent)
                call.handleMatrixInvite(sdp, matrixId, number)
                call.on('close' ,() => {
                    delete callMapping[callId]
                })
                callMapping[callId] = call
                break

            // SDP candidates
            case 'm.call.candidates':
                call = callMapping[callId]
                if(!call) return
                await call.handleCandidates(event)
                break

            // matrix user hangs up the call
            case 'm.call.hangup':
                call = callMapping[callId]
                if(!call) return
                call.hangup()
                break

            case 'm.room.message':
                console.log(`Received message ${event["event_id"]} from ${event["sender"]} in ${roomId}: ${event["content"]["body"]}`);
            }
    } catch(err) {
        console.error(err)
        intent.sendText(roomId, 'Error processing the call:\n'+err.message, 'm.notice')
    }
});
async function main() {

    userAgent.on('connected', function (e) {
        console.log("WS connected")
    });
    userAgent.start();
    var eventHandlers = {
        'progress': function(e) {
            console.log('call is in progress');
        },
        'failed': function(e) {
            console.log('call failed with cause: '+ e.data.cause);
        },
        'ended': function(e) {
            console.log('call ended with cause: '+ e.data.cause);
        },
        'confirmed': function(e) {
            console.log('call confirmed');
        }
    };
    var options = {
        'eventHandlers'    : eventHandlers,
        'mediaConstraints' : { 'audio': true, 'video': true }
    };

    // var session = ua.call('sip:02836222777@192.168.16.53:5060', options);
    // await userAgent.start()
    // console.log('sip connected')

    await appservice.begin()
    console.log('appservice is up!')
}

main()