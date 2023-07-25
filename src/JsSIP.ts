// import * as jsSIP from 'jssip'

// const socket = new jsSIP.WebSocketInterface("wss://192.168.16.53:5060");
// const configuration = {
//   sockets: [socket],
//   uri: 'sip:02836222777@192.168.16.53:5060',
//   // password: 'superpassword'
// };

// let ua = new jsSIP.UA(configuration);

// ua.start();

// Register callbacks to desired call events
// let eventHandlers = {
//   'progress': function (e) {
//     console.log('call is in progress');
//   },
//   'failed': function (e) {
//     console.log('call failed with cause: ' + e.data.cause);
//   },
//   'ended': function (e) {
//     console.log('call ended with cause: ' + e.data.cause);
//   },
//   'confirmed': function (e) {
//     console.log('call confirmed');
//   }
// };

// let options = {
//   'eventHandlers': eventHandlers,
//   'mediaConstraints': { 'audio': true, 'video': true }
// };

// let session = ua.call('sip:bob@example.com', options);
