var AgoraRTCNack = (function () {

    const RemoteStatusGood = 0;
    const RemoteStatusFair = 1;
    const RemoteStatusPoor = 2;
    const RemoteStatusCritical = 3;

    var _rtc_clients = [];
    var _rtc_num_clients = 0;

    var _monitorRemoteCallStatsInterval;
    var _remoteCallStatsMonitorFrequency;
    var _userStatsMap = {};
    var _clientStatsMap = {};
    var _monitorStart = Date.now();
    var _monitorEnd = Date.now();
    var _remoteStatus = "";

    async function monitorRemoteCallStats() {
        try {
            _clientStatsMap = {
                RemoteSubCount: 0,
                RecvBitrate: 0,
                SendBitrate: 0,
                SumRxNR: 0,
                SumRxLoss: 0,
                AvgRxNR: 0,
                AvgRxLoss: 0,
                RemoteStatusDuration: 0,
                RemoteStatus: 0,
                RemoteStatusExtra: 0,
                StatsRunTime: 0,
                StatsScheduleTime: 0
            };

            _monitorStart = Date.now();
            _clientStatsMap.StatsScheduleTime = _monitorStart - _monitorEnd;

            for (var i = 0; i < _rtc_num_clients; i++) {
                var client = _rtc_clients[i];
                if (client && client._p2pChannel && client._p2pChannel.connection) {
                    for (var u = 0; u < client._users.length; u++) {
                        var uid = client._users[u].uid;
                        if (client._p2pChannel.connection.peerConnection && client.getRemoteVideoStats()[uid] && client._users[u].videoTrack && client._users[u].videoTrack._mediaStreamTrack) {
                            // check each remote user has last stats map
                            if (!_userStatsMap[uid]) {
                                _userStatsMap[uid] = {
                                    uid: uid,
                                    lastStatsRead: 0,
                                    lastNack: 0,
                                    nackRate: 0,
                                    lossRate: 0,
                                    packetChange: 0,
                                    receiveResolutionWidth: 0,
                                    receiveResolutionHeight: 0,
                                    receiveBitrate: 0,
                                    renderFrameRate: 0
                                };
                            }

                            await client._p2pChannel.connection.peerConnection.getStats(client._users[u].videoTrack._mediaStreamTrack).then(async stats => {
                                await stats.forEach(report => {
                                    if (report.type === "inbound-rtp" && report.kind === "video") {
                                        var now = Date.now();
                                        var nack = report["nackCount"];
                                        var packetsReceived = report["packetsReceived"];
                                        var nackChange = (nack - _userStatsMap[uid].lastNack);
                                        var packetChange = (packetsReceived - _userStatsMap[uid].lastPacketsRecvd);

                                        //       console.log(nack, packetsReceived,nackChange,packetChange);

                                        /*
                                        var resetStats = false;
                                        if (packetChange < 0) {
                                            resetStats = true;
                                        }*/
                                        var timeDiff = now - _userStatsMap[uid].lastStatsRead;
                                        var nackRate = 0;
                                        if (packetChange > 0 && nackChange > 0) {
                                            nackRate = Math.floor((nackChange / packetChange) * (timeDiff / 10));
                                        }
                                        _userStatsMap[uid].lastStatsRead = now;
                                        _userStatsMap[uid].lastNack = nack;
                                        _userStatsMap[uid].nackRate = nackRate;
                                        _userStatsMap[uid].lastPacketsRecvd = packetsReceived;
                                        _userStatsMap[uid].packetChange = packetChange;
                                    }
                                })
                            });

                            const remoteTracksStats = { video: client.getRemoteVideoStats()[uid], audio: client.getRemoteAudioStats()[uid] };
                            if (remoteTracksStats.video.renderFrameRate) {
                                _userStatsMap[uid].renderFrameRate = Number(remoteTracksStats.video.renderFrameRate);
                            } else {
                                _userStatsMap[uid].renderFrameRate = 0;
                            }

                            if (remoteTracksStats.video.receivePacketsLost) {
                                _userStatsMap[uid].lossRate = Number(remoteTracksStats.video.receivePacketsLost);
                            } else {
                                _userStatsMap[uid].lossRate = 0;
                            }
                            _userStatsMap[uid].receiveResolutionWidth = Number(remoteTracksStats.video.receiveResolutionWidth).toFixed(0);
                            _userStatsMap[uid].receiveResolutionHeight = Number(remoteTracksStats.video.receiveResolutionHeight).toFixed(0);
                            _userStatsMap[uid].receiveBitrate = Number(remoteTracksStats.video.receiveBitrate / 1000).toFixed(0);
                            if (_userStatsMap[uid].packetChange > 0) {
                                _userStatsMap[uid].totalDuration = Number(remoteTracksStats.video.totalDuration).toFixed(0);
                            } else {
                                _userStatsMap[uid].totalDuration = -1;
                            }

                            if (_userStatsMap[uid].packetChange > 0 && _userStatsMap[uid].totalDuration > 1) // when people drop they remain for a while
                            {
                                if (_userStatsMap[uid].nackRate > 0 && !isNaN(_userStatsMap[uid].nackRate)) {
                                    _clientStatsMap.SumRxNR = _clientStatsMap.SumRxNR + _userStatsMap[uid].nackRate;
                                }

                                if (_userStatsMap[uid].lossRate > 0 && !isNaN(_userStatsMap[uid].lossRate)) {
                                    _clientStatsMap.SumRxLoss = _clientStatsMap.SumRxLoss + _userStatsMap[uid].lossRate;
                                }

                                _clientStatsMap.RemoteSubCount = _clientStatsMap.RemoteSubCount + 1;
                            }
                        }
                    }
                    // channel (client) level stats
                    const clientStats = client.getRTCStats();
                    _clientStatsMap.RecvBitrate = _clientStatsMap.RecvBitrate + clientStats.RecvBitrate;
                    _clientStatsMap.SendBitrate = _clientStatsMap.SendBitrate + clientStats.SendBitrate;
                }
            }

            _clientStatsMap.AvgRxNR = _clientStatsMap.SumRxNR / _clientStatsMap.RemoteSubCount;
            _clientStatsMap.AvgRxLoss = _clientStatsMap.SumRxLoss / _clientStatsMap.RemoteSubCount;
            _monitorEnd = Date.now();
            _clientStatsMap.StatsRunTime = (_monitorEnd - _monitorStart);

            let remoteStatus = RemoteStatusGood;
            if (_clientStatsMap.AvgRxNR > 20) {
                remoteStatus = RemoteStatusCritical;
            } else if (_clientStatsMap.AvgRxNR > 10 || (_remoteStatus > RemoteStatusFair && _clientStatsMap.AvgRxNR > 8)) {
                remoteStatus = RemoteStatusPoor;
            } else if (_clientStatsMap.AvgRxNR > 4) {
                remoteStatus = RemoteStatusFair;
            }

            if (_remoteStatus !== remoteStatus) {
                _remoteStatus = remoteStatus;
                AgoraRTCNackEvents.emit("StatusChange", _remoteStatus);
            }

            console.log(_remoteStatus, "AvgRxNR", _clientStatsMap.AvgRxNR, "RemoteSubCount", _clientStatsMap.RemoteSubCount);
        }
        catch (err) {
            console.error(err);
        }

        if (_monitorRemoteCallStatsInterval) {
            setTimeout(() => {
                monitorRemoteCallStats();
            }, _remoteCallStatsMonitorFrequency);
        }
    }


    return { // public interfaces
        // RTM tokens
        monitorNack: function () {
            _rtc_clients = __ARTC__.__CLIENT_LIST__;
            _rtc_num_clients = __ARTC__.__CLIENT_LIST__.length;
            _monitorRemoteCallStatsInterval = true;
            _remoteCallStatsMonitorFrequency = 800;
            setTimeout(() => {
                monitorRemoteCallStats();
            }, _remoteCallStatsMonitorFrequency);
        },

        getRemoteAvgNack: function () {
            return _clientStatsMap.AvgRxNR;
        },
        RemoteStatusGood: RemoteStatusGood,
        RemoteStatusFair: RemoteStatusFair,
        RemoteStatusPoor: RemoteStatusPoor,
        RemoteStatusCritical: RemoteStatusCritical,
    };
})();

var AgoraRTCNackEvents = (function () {
    var events = {};
    function on(eventName, fn) {
        events[eventName] = events[eventName] || [];
        events[eventName].push(fn);
    }

    function off(eventName, fn) {
        if (events[eventName]) {
            for (var i = 0; i < events[eventName].length; i++) {
                if (events[eventName][i] === fn) {
                    events[eventName].splice(i, 1);
                    break;
                }
            }
        }
    }

    function emit(eventName, data) {
        if (events[eventName]) {
            events[eventName].forEach(function (fn) {
                fn(data);
            });
        }
    }

    return {
        on: on,
        off: off,
        emit: emit
    };
})();