import { Intent, RoomEvent } from 'matrix-bot-sdk';
import { EventEmitter } from "events";
import { UA, URI } from 'jssip';


export default class Call extends EventEmitter {
    private callId: string
    private roomId: string
    private sipUA: UA
    private isCallEstablished = false
    private intent: Intent
    private sdpCandidates: string = ''
    constructor(callId: string, roomId: string, intent: Intent, sipUA: UA) {
        super()
        this.callId = callId
        this.sipUA = sipUA
        this.roomId = roomId
        this.intent = intent
        console.log(`[${this.callId}] created`)
    }

    /**
     * Handle SDP candidates from the matrix user
     */
    async handleCandidates(event: RoomEvent<any>) {
        const candidates  = event.content.candidates
        if(!candidates.length) return
        for(let c of candidates) {
            if(!c.candidate) continue
            this.sdpCandidates += 'a='+c.candidate+'\r\n'
        }
        this.sdpCandidates += 'a=end-of-candidates\r\n'

    }
    /**
     * Handle an Invitation by an matrix user
     * It might wait for SDP candidates
     */
    async handleMatrixInvite(sdp: string, matrixId: string, number: string) {
        if(sdp.includes('a=candidate:')) {
            // candidates already included
            await this.inviteSIP(sdp, matrixId, number)
        } else {
            // candidates come later with an m.call.candidates event
            await this.waitForCandidates( () => {
                return this.inviteSIP(sdp, matrixId, number)
            })
        }
    }

    /**
     * wait for an m.call.candidates event event or timeout after 3 seconds
     */
    private async waitForCandidates(cb: Function): Promise<void> {
        return new Promise( (resolve, reject) => {
            const interval = setInterval(() => {
                if(this.sdpCandidates) {
                    clearInterval(interval)
                    const res = cb()
                    if(res instanceof Promise) {
                        res.then(resolve)
                    } else {
                        resolve()
                    }
                }
            }, 100)

            // timeout? -> hangup
            setTimeout( () => {
                if(this.sdpCandidates) return
                clearInterval(interval)
                this.hangup()
                reject(new Error('timeout waiting for candidates'))
            }, 3000)
        })

    }
    /**
     * forward the matrix call including the SDP towards freeswitch
     */
    private async inviteSIP(sdp: string, matrixId: string, number: string) {
        console.log("Call to SIP")
        if(!this.sipUA.isConnected()) {
            this.hangup()
            return
        }
        const target = new URI('sip', '02836222777', '192.168.16.53', 5060);
        this.sipUA.call(target.toAor())
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
                "m.call.dtmf": false // TODO: handle DTMF
            },
            call_id: this.callId,
            // party_id: client.deviceId,
            version: 1
        }
        this.sendMatrixEvent("m.call.answer", content)
        this.isCallEstablished = true
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
    hangup(reason?: "ice_failed"|"invite_timeout", bySIP: boolean = false) {
        const type = this.isCallEstablished ? "m.call.hangup" : "m.call.reject"
        const content = {
            call_id: this.callId,
            // party_id: client.deviceId,
            version: 1,
            reason
        }

        this.sendMatrixEvent(type, content)

        // clean up
        this.sipUA = null
        this.emit('close')
    }
}
