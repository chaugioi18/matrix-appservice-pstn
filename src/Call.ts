import {Intent, RoomEvent} from 'matrix-bot-sdk';
import {EventEmitter} from "events";
import * as sip from 'sip';

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

    /**
     * SIP user accepted the call, let's return that to
     * the matrix user
     */
    onSipInviteResponse = (sdp: string) => {
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
