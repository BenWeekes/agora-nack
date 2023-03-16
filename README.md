
## AgoraRTCNack.js
This javascript module provides a way to monitor the average nack rate of remote video streams with the AgoraRTC 4.x SDK.

This is useful for responsive bandwidth control algorithms.

#### Include the javascript:

         <script src="./AgoraRTCNack.js"></script>
                
#### Call the method 

Before publishing your video to the channel, call the monitorNack method:

  AgoraRTCNetEx.monitorNack();       
  
You can now register for callbacks when the remote status changes
 
 AgoraRTCNackEvents.on("StatusChange",(v)=>{console.log("Nack StatusChange",v);});
 

The values passed in callback are 

    const RemoteStatusGood = 0;
    const RemoteStatusFair = 1;
    const RemoteStatusPoor = 2;
    const RemoteStatusCritical = 3;

You can retrieve the remote avg nack rate at any time with

let avgnack= AgoraRTCNack.getRemoteAvgNack();

#### Demo
https://sa-utils.agora.io/agora-nack/index.html

#### Demo Video
https://sa-utils.agora.io/agora-nack/index.html
