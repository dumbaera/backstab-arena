const express = require('express');
const path = require('path'); // 파일 경로를 찾기 위해 추가됨
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

// ★ 브라우저에서 서버 주소로 접속하면 index.html 파일을 보내주는 코드
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 현재 접속 중인 플레이어 목록
let connectedPlayers = [];

io.on('connection', (socket) => {
    console.log('유저 접속! ID:', socket.id);

    // 1. 방 입장 및 역할 배정
    if (connectedPlayers.length < 2) {
        let role = connectedPlayers.length === 0 ? 'p1' : 'p2';
        connectedPlayers.push({ id: socket.id, role: role });
        
        socket.emit('roleAssign', role);
        console.log(`${socket.id} 님에게 ${role} 역할을 부여했습니다.`);

        if (connectedPlayers.length === 2) {
            console.log("두 명이 모였습니다. 게임을 시작합니다!");
            io.emit('gameStart'); 
        }
    } else {
        socket.emit('message', '방이 꽉 찼습니다. 관전 모드입니다.');
    }

    // 2. 위치 데이터 중계
    socket.on('playerState', (data) => {
        socket.broadcast.emit('enemyState', data);
    });

    // 3. 누군가 나갔을 때
    socket.on('disconnect', () => {
        console.log('유저 퇴장! ID:', socket.id);
        connectedPlayers = connectedPlayers.filter(p => p.id !== socket.id);
        io.emit('playerLeft'); 
    });
});

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`🚀 멀티플레이 서버가 ${PORT} 포트에서 실행 중입니다...`);
});