import Call from './Call'
import {getIntentInRoom} from "./store";
import {createAppservice, getOrUploadAvatarUrl} from "./appservice";
import {formatPhoneNumber} from './utils';
import {APPSERVICE_CONFIG, COUNTRY_CODE} from './config';
import {setupProxy} from './sip';
import * as sip from 'sip';
import * as proxy from 'sip/proxy';

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
                // sip = sip.parseUri("sip:842836222777@192.168.16.53:5060");
                const sdp = event.content?.offer?.sdp
                const number = appservice.getSuffixForUserId(intent.userId)
                call = new Call(callId, roomId, intent)
                call.handleMatrixInvite(matrixId, number, sdp)
                call.on('close', () => {
                    delete callMapping[callId]
                })
                callMapping[callId] = call
                console.log(`Save callId ${callId}`)
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
    proxy.start({
            logger: {
                recv: function (m) {
                    // console.log('recv:' + JSON.stringify(m));
                },
                send: function (m) {
                    // console.log('send:' + JSON.stringify(m));
                },
                error: function (e) {
                    console.log(e.stack);
                }
            },
            publicAddress: '192.168.18.55',
        }, function (rq) {
            var callId = rq.headers['Call-ID']
            if (callMapping[callId]) {
                proxy.send(sip.makeResponse(rq, 100, 'Trying'));
                // proxy.send(rq);
            } else {
                proxy.send(sip.makeResponse(rq, 200, 'OK'));
            }
        }
    )
    await appservice.begin()
    console.log('appservice is up!')
}

export function getCall(callId: string) {
    console.log(`Search callId ${callId}`)
    if (callMapping[callId]) {
        return callMapping[callId]
    }
    return undefined
}


main()
