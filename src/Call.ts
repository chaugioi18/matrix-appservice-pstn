import {Intent, RoomEvent} from 'matrix-bot-sdk';
import {EventEmitter} from "events";
import * as sip from 'sip';
import {getCall} from './main';

function rstring() {
    return Math.floor(Math.random() * 1e6).toString();
}

function randnum() {
    Math.floor(Math.random() * 1e5)
}

export default class Call extends EventEmitter {
    private callId: string
    private roomId: string
    private isCallEstablished = false
    private intent: Intent
    private sdpCandidates: string = ''

    constructor(callId: string, roomId: string, intent: Intent) {
        super()
        this.callId = callId
        this.roomId = roomId
        this.intent = intent
        console.log(`[${this.callId}] created`)
    }

    /**
     * Handle SDP candidates from the matrix user
     */
    async handleCandidates(event: RoomEvent<any>) {
        const candidates = event.content.candidates
        if (!candidates.length) return
        for (let c of candidates) {
            if (!c.candidate) continue
            this.sdpCandidates += 'a=' + c.candidate + '\r\n'
        }
        this.sdpCandidates += 'a=end-of-candidates\r\n'

    }

    /**
     * wait for an m.call.candidates event event or timeout after 3 seconds
     */
    private async waitForCandidates(cb: Function): Promise<void> {
        return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                if (this.sdpCandidates) {
                    clearInterval(interval)
                    const res = cb()
                    if (res instanceof Promise) {
                        res.then(resolve)
                    } else {
                        resolve()
                    }
                }
            }, 100)

            // timeout? -> hangup
            setTimeout(() => {
                if (this.sdpCandidates) return
                clearInterval(interval)
                this.hangup()
                reject(new Error('timeout waiting for candidates'))
            }, 3000)
        })

    }

    async handleMatrixInvite(sdp: string, matrixId: string, number: string) {
        if(sdp.includes('a=candidate:')) {
            await this.inviteSIP(sdp, matrixId, number)
        } else {
            await this.waitForCandidates( () => {
                return this.inviteSIP(sdp, matrixId, number)
            })
        }
    }

    private async inviteSIP(sdp: string, matrixId: string, phone: string) {
        console.log(`BEFORE CALLING.... ${phone}`)
        phone = phone.replace("+84", "0")
        console.log(`CALLING.... ${phone}`)
        sdp = sdp.replace(/^m=audio.*\r\n?/gm, 'm=audio 9 RTP/AVP 0 8 101\r\n')
        // sdp = sdp.replace(/^a=ice.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=fingerprint:.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=group:.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=msid.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=extmap:.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=setup:.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=ssrc:.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=mid:.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=rtcp.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=fmtp:109.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=rtpmap:109.*\r\n?/gm, '')
        // sdp = sdp.replace(/^a=rtpmap:9.*\r\n?/gm, '')
        var perLine = sdp.split('\r\n');
        var pwd
        var ufrag
        for (var i = 0; i < perLine.length; i++) {
            if (perLine[i].startsWith('a=ice-pwd:')) {
                pwd = perLine[i]
            }
            if (perLine[i].startsWith('a=ice-ufrag:')) {
                ufrag = perLine[i]
            }
        }
        sdp += 'a=ptime:30\r\n'
        sdp = sdp
            .split("\r\n")
            .filter((item, i, allItems) => {
                return i === allItems.indexOf(item);
            })
            .join("\r\n");
        sip.send({
                method: 'INVITE',
                uri: 'sip:' + phone + '@192.168.16.53:5060;user=phone', // thieu user=phone -> nghien cuu them no lay ten gi tu client
                headers: {
                    via: [],
                    from: {name: matrixId, uri: 'sip:842836222777@192.168.18.55', params: {tag: rstring()}}, //phuc test vua them
                    to: {uri: 'sip:' + phone + '@192.168.16.53;user=phone'}, //phuc test vua them
                    contact: [{uri: 'sip:842836222777@192.168.18.55:5060'}],
                    'call-id': this.callId,
                    cseq: {method: 'INVITE', seq: Math.floor(Math.random() * 1e5)},
                    'content-type': 'application/sdp',
                    'User-Agent': "Synapse",
                    Date: new Date().toUTCString(),
                    Allow: "INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, SUBSCRIBE, NOTIFY, INFO, PUBLISH",
                    Supported: "replaces, timer"
                },
                content: sdp,
                // content:
                //     'v=0\r\n' +
                //     'o=- 147852963 147852964 IN IP4 192.168.18.55\r\n' +
                //     's=-\r\n' +
                //     'c=IN IP4 192.168.18.55\r\n' +
                //     't=0 0\r\n' +
                //     'm=audio 9 RTP/AVP 0 8 101\r\n' +
                //     'a=rtpmap:0 PCMU/8000\r\n' +
                //     'a=rtpmap:8 PCMA/8000\r\n' +
                //     'a=rtpmap:101 telephone-event/8000\r\n' +
                //     'a=fmtp:101 0-15\r\n' +
                //     'a=ptime:30\r\n' +
                //     'a=sendrecv\r\n'
            },
            function (rs) {
                console.log(`Call Response Status ${JSON.stringify(rs)}`)
                if (rs.status >= 300) {
                    console.log('call failed with status ' + rs.status);
                } else if (rs.status < 200) {
                    console.log('call progress status ' + rs.status);
                } else if (rs.status == 200) {
                    console.log('call answered with tag ' + rs.headers.to.params.tag);
                    sip.send({
                        method: 'ACK',
                        uri: rs.headers.contact[0].uri,
                        headers: {
                            via: [],
                            from: rs.headers.from,
                            to: rs.headers.to,
                            'call-id': rs.headers['call-id'],
                            cseq: {method: 'ACK', seq: rs.headers.cseq.seq},
                            'User-Agent': "Synapse",
                        }
                    });
                    let exactlyCall = getCall(rs.headers['call-id'])
                    let rssdp = rs.content
                    rssdp += ufrag + '\r\n'
                    rssdp += pwd + '\r\n'
                    console.log(`Response content ${rssdp}`)
                    if (exactlyCall) {
                        exactlyCall.onSipInviteResponse(rssdp);
                    }
                }
            });
        console.log('invited')
    }

    /**
     * SIP user accepted the call, let's return that to
     * the matrix user
     */
    private onSipInviteResponse = (sdp: string) => {
        const content = {
            answer: {
                sdp,
                type: 'answer'
            },
            capabilities: {
                "m.call.transferee": false,
                "m.call.dtmf": false
            },
            call_id: this.callId,
            version: 1
        }
        this.sendMatrixEvent("m.call.answer", content)
        this.isCallEstablished = true
    }

    /**
     * Forwards an invite from SIP towards the Matrix User
     */
    inviteMatrix(sdp: string) {
        this.sendMatrixEvent("m.call.invite", {
            lifetime: 60000,
            offer: {
                type: "offer",
                sdp
            },
            capabilities: {
                "m.call.transferee": false,
                "m.call.dtmf": false
            },
            "version": 1,
            "call_id": this.callId,
        })
    }

    /**
     * Forwards an matrix call accept event (m.call.answer) to SIP
     */
    async handleAnswer(event: RoomEvent<any>) {
        const callId = event.content?.call_id
        const sdp: string = event.content?.answer?.sdp
        if (!sdp || !callId) return

        const accept = async () => {
            //TODO Accept
        }
        if (sdp.includes('a=candidate:')) {
            await accept()
        } else {
            await this.waitForCandidates(accept)
        }
    }

    /**
     * send an event into the related matrix room
     */
    private sendMatrixEvent(type: string, content: any) {
        this.intent.underlyingClient.sendEvent(this.roomId, type, content)
    }


    /**
     * hangup the current call and clean up references
     */
    hangup(reason?: "ice_failed" | "invite_timeout", bySIP: boolean = false) {
        const type = this.isCallEstablished ? "m.call.hangup" : "m.call.reject"
        const content = {
            call_id: this.callId,
            version: 1,
            reason
        }

        this.sendMatrixEvent(type, content)

        // clean up
        this.emit('close')
    }
}
