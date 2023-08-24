import {Invitation} from "sip.js";
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
async function onInvite(invitation: Invitation) {
    const matrixId = invitation.request.headers['X-Matrix-Id']?.[0]?.raw
    const callId = invitation.request.callId

    // prepend contry code?
    let from = invitation.request.from.displayName
    if (from.startsWith('0') && !from.startsWith('00')) {
        from = COUNTRY_CODE + from.slice(1)
    }
    if (from.startsWith('00')) {
        from = '+' + from.slice(2)
    }

    if (!matrixId) {
        await invitation.reject()
        console.error('got invite, but without any matrixId', {matrixId, callId, from})
        return
    }
    if (!from.slice(1).match(/^[0-9]+/)) {
        await invitation.reject()
        console.error('got invite, but From/Caller-ID seems invalid', {matrixId, callId, from})
        return
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
        console.log(r, {members})
        if (members.includes(matrixId)) {
            roomId = r
            break
        }
    }

    // if not, create one
    if (!roomId) {
        roomId = await intent.underlyingClient.createRoom({
            preset: 'private_chat',
            name: formatPhoneNumber(from),
            is_direct: true,
            invite: [matrixId]
        })
    }

    // create call pobject
    // const call = new Call(callId, roomId, intent, userAgent)

    // store to match with later matrix events
    // callMapping[callId] = call

    // handle Invitation
    // call.inviteMatrix(invitation)
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
    const callId = event.content?.call_id

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
                if (!sip.parseUri("sip:842836222777@192.168.16.53:5060")) {
                    console.log("Sip parse uri failed")
                } else {
                    console.log("Sip parse successful")
                    console.log(`SIP ${sip}`)
                }
                let sdp = event.content.offer.sdp
                sdp = sdp.replace("IN IP4 0.0.0.0", "IN IP4 192.168.18.55")
                sdp = sdp.replace("IN IP4 127.0.0.1", "IN IP4 192.168.18.55")
                var lines = sdp.split("\r\n")
                sdp = ""
                for(var i = 0;i < lines.length;i++){
                    if (lines[i].includes("a=rtcp") || lines[i].includes("a=rtpmap") || lines[i].includes("a=fmtp")) {
                        if (!(lines[i].includes(":0 ") || lines[i].includes(":8 ") || lines[i].includes(":101 "))) {
                            lines[i] = "";
                        }
                    }
                    sdp += lines[i]
                }
                sip.send({
                        method: 'INVITE',
                        uri: 'sip:0397196737@192.168.16.53:5060',
                        headers: {
                            via: [],
                            from: {uri: 'sip:842836222777@192.168.18.55:5060', params: {tag: rstring()}},
                            to: {uri: 'sip:0397196737@192.168.16.53', params: {tag: rstring()}},
                            'call-id': callId,
                            cseq: {method: 'INVITE', seq: Math.floor(Math.random() * 1e5)},
                            'content-type': 'application/sdp',
                            contact: [{uri: 'sip:842836222777@192.168.18.55:5060'}],
                            'User-Agent': "Synapse",
                            Date: new Date().toUTCString(),
                            Allow: "INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, SUBSCRIBE, NOTIFY, INFO, PUBLISH",
                            Supported: "replaces, timer"
                        },
                        content: sdp,
                        // content:
                        //     'v=0\r\n'+
                        //     'o=- SOUTHTELECOM 147852963 147852964 IN IP4 172.16.2.2\r\n'+
                        //     's=-\r\n'+
                        //     'c=IN IP4 172.16.2.2\r\n'+
                        //     't=0 0\r\n'+
                        //     'm=audio 16424 RTP/AVP 0 8 101\r\n'+
                        //     'a=rtpmap:0 PCMU/8000\r\n'+
                        //     'a=rtpmap:8 PCMA/8000\r\n'+
                        //     'a=rtpmap:101 telephone-event/8000\r\n'+
                        //     'a=fmtp:101 0-15\r\n'+
                        //     'a=ptime:30\r\n'+
                        //     'a=sendrecv\r\n'
                    },
                    function (rs) {
                        console.log(`RS!!!!! ${JSON.stringify(rs)}`)
                        if (rs.status >= 300) {
                            console.log('call failed with status ' + rs.status);
                        } else if (rs.status < 200) {
                            console.log('call progress status ' + rs.status);
                        } else {
                            // yes we can get multiple 2xx response with different tags
                            console.log('call answered with tag ' + rs.headers.to.params.tag);
                            // const content = {
                            //     answer: {
                            //         sdp,
                            //         type: 'answer'
                            //     },
                            //     capabilities: {
                            //         "m.call.transferee": false,
                            //         "m.call.dtmf": false // TODO: handle DTMF
                            //     },
                            //     call_id: this.callId,
                            //     // party_id: client.deviceId,
                            //     version: 1
                            // }
                            // intent.underlyingClient.sendEvent(this.roomId, "m.call.answer", content)
                            // sending ACK
                            sip.send({
                                method: 'ACK',
                                uri: rs.headers.contact[0].uri,
                                headers: {
                                    to: rs.headers.to,
                                    from: rs.headers.from,
                                    'call-id': rs.headers['call-id'],
                                    cseq: {method: 'ACK', seq: rs.headers.cseq.seq},
                                }
                            });

                            var id = [rs.headers['call-id'], rs.headers.from.params.tag, rs.headers.to.params.tag].join(':');
                            if (!dialogs[id]) {
                                dialogs[id] = function (rq) {
                                    if (rq.method === 'BYE') {
                                        console.log('call received bye');

                                        delete dialogs[id];

                                        sip.send(sip.makeResponse(rq, 200, 'Ok'));
                                    } else {
                                        sip.send(sip.makeResponse(rq, 405, 'Method not allowed'));
                                    }
                                }
                            }
                        }
                    });
                // if (false) {
                //     const sdp = event.content?.offer?.sdp
                //     const number = appservice.getSuffixForUserId(intent.userId)
                //     call = new Call(callId, roomId, intent, userAgent)
                //     call.handleMatrixInvite(sdp, matrixId, number)
                //     call.on('close' ,() => {
                //         delete callMapping[callId]
                //     })
                //     callMapping[callId] = call
                // }
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
            var rs = sip.makeResponse(rq, 200, 'Ok');
            proxy.send(rs);
        }
    )
    await appservice.begin()
    console.log('appservice is up!')
}

main()