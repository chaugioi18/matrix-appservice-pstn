import Call from './Call'
import {getIntentInRoom} from "./store";
import {createAppservice, getOrUploadAvatarUrl} from "./appservice";
import {formatPhoneNumber} from './utils';
import {APPSERVICE_CONFIG, COUNTRY_CODE} from './config';
// import { createUserAgent } from './sip';

var sip = require('sip')
var proxy = require('sip/proxy')

// mapping between Call-IDs and Call instances
const callMapping: { [callId: string]: Call } = {}

/**
 * Called when we recieve an invite from freeswitch
 */
async function onInvite(rq) {
    const callId = rq.headers['call-id']
    let from = rq.headers.from.name
    if (from.startsWith('0') && !from.startsWith('00')) {
        from = COUNTRY_CODE + from.slice(1)
    }
    if (from.startsWith('00')) {
        from = '+' + from.slice(2)
    }
    // get or create intent
    const intent = appservice.getIntentForSuffix(from)
    await intent.ensureRegistered()
    await intent.underlyingClient.setDisplayName(formatPhoneNumber(from));
    await intent.underlyingClient.setAvatarUrl(await getOrUploadAvatarUrl());

    // is there already a room with that number and that matrix ID?
    const rooms = await intent.getJoinedRooms()
    let roomId: string
    for (let r of rooms) {
        const members = await intent.underlyingClient.getJoinedRoomMembers(r)
        // if (members.includes(matrixId)) {
        //     roomId = r
        //     break
        // }
    }

    // if not, create one
    if (!roomId) {
        roomId = await intent.underlyingClient.createRoom({
            preset: 'private_chat',
            name: formatPhoneNumber(from),
            is_direct: true,
            // invite: [matrixId]
        })
    }

    // create call pobject
    const call = new Call(callId, roomId, intent)

    // store to match with later matrix events
    callMapping[callId] = call

    // handle Invitation
    call.inviteMatrix(rq.content)
}

// const userAgent = createUserAgent(onInvite)
const appservice = createAppservice(APPSERVICE_CONFIG)

appservice.on("room.event", async (roomId, event) => {
    console.log(`EVENTTTTTTTTTTTTT ${JSON.stringify(event)}`)
    // is it a event sent by the appservice?
    if (appservice.getSuffixForUserId(event["sender"])) {
        // ignore
        return
    }

    console.log(`Received event ${event["event_id"]} (${event["type"]}) from ${event["sender"]} in ${roomId}`);

    const matrixId = event.sender
    const callId = event.content?.call_id + "@192.168.16.53:5060"
    const phone = "0397196737"

    // let's find an intent which is able to post in that room
    const intent = await getIntentInRoom(roomId, appservice)
    if (!intent) {
        console.error(`we could not find any way to participate in room ${roomId} after recieving an '${event.type}' event`)
        return
    }

    function rstring() {
        return Math.floor(Math.random() * 1e6).toString();
    }

    function randnum() {
        Math.floor(Math.random() * 1e5)
    }

    let call: Call
    try {
        switch (event["type"]) {

            // Invite to a new call by the matrix user
            case 'm.call.invite':
                console.log(`EVENT ${JSON.stringify(event)}`)
                // sip = sip.parseUri("sip:842836222777@192.168.16.53:5060");
                    const sdp = event.content?.offer?.sdp
                    const number = appservice.getSuffixForUserId(intent.userId)
                    call = new Call(callId, roomId, intent)
                    call.handleMatrixInvite(sdp)
                    call.on('close' ,() => {
                        delete callMapping[callId]
                    })
                    callMapping[callId] = call
                break
            // SDP candidates
            case 'm.call.candidates':
                call = callMapping[callId]
                if (!call) return
                await call.handleCandidates(event)
                break

            // matrix user accepts the out call invite
            case 'm.call.answer':
                call = callMapping[callId]
                if (!call) return
                await call.handleAnswer(event)
                break

            // matrix user hangs up the call
            case 'm.call.hangup':
                call = callMapping[callId]
                if (!call) return
                call.hangup()
                break

            case 'm.room.message':
                console.log(`Received message ${event["event_id"]} from ${event["sender"]} in ${roomId}: ${event["content"]["body"]}`);
        }
    } catch (err) {
        console.error(err)
        // intent.sendText(roomId, 'Error processing the call:\n'+err.message, 'm.notice')
    }
});
var dialogs = {};

async function main() {
    // await userAgent.start()
    // console.log('sip connected')
    // sip.start({}, function (rq) {
    //     console.log(`SIP START ${JSON.stringify(rq)}`)
    //     sip.send(sip.makeResponse(rq, 200, "OK"));
    //     // if(rq.headers.to) { // check if it's an in dialog request
    //     //     var id = [rq.headers['call-id'], rq.headers.to.params.tag, rq.headers.from.params.tag].join(':');
    //     //     if(dialogs[id])
    //     //         dialogs[id](rq);
    //     //     else
    //     //         sip.send(sip.makeResponse(rq, 481, "Call doesn't exists"));
    //     //     console.log(`call id ${id}`)
    //     // }
    //     // else{
    //     //     console.log(`Method not allowed`)
    //     //     sip.send(sip.makeResponse(rq, 405, 'Method not allowed'));
    //     // }
    //     console.log("SIP END")
    // });
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
    await appservice.begin()
    console.log('appservice is up!')
}

main()
