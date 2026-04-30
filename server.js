const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const path = require('path');
const mongoose = require('mongoose');

// HTML 파일을 띄워주기 위한 설정
app.use(express.static(__dirname));
app.use(express.static('public'));

// ==========================================
// 영구 데이터베이스(MongoDB) 설정
// ==========================================
const MONGO_URI = 'mongodb+srv://dumbaera_9281_play:play1234@cluster0.fkzqfyl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// 몽고DB 연결 시도
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB(데이터베이스) 영구 연결 성공!'))
    .catch(err => console.log('❌ MongoDB 연결 실패:', err));

// 유저 데이터의 '설계도(Schema)' 정의
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, 
    pw: { type: String, required: true },               
    data: { type: Object, default: null }               
});

const User = mongoose.model('User', userSchema);
let connectedPlayers = [];

io.on('connection', (socket) => {
    console.log('기기 접속! Socket ID:', socket.id);

    // 1. 회원가입 로직
    socket.on('register', async (data) => {
        if (!data.id || !data.pw) {
            return socket.emit('registerResult', { success: false, msg: 'ID와 비밀번호를 모두 입력해주세요.' });
        }
        try {
            const existingUser = await User.findOne({ id: data.id });
            if (existingUser) {
                socket.emit('registerResult', { success: false, msg: '이미 사용 중인 ID입니다. 다른 ID를 입력해주세요.' });
            } else {
                const newUser = new User({ id: data.id, pw: data.pw, data: null });
                await newUser.save();
                socket.emit('registerResult', { success: true });
            }
        } catch (err) {
            console.error('회원가입 에러:', err);
            socket.emit('registerResult', { success: false, msg: '서버 DB 오류가 발생했습니다.' });
        }
    });

    // 2. 로그인 로직
    socket.on('login', async (data) => {
        try {
            const user = await User.findOne({ id: data.id });
            if (user && user.pw === data.pw) {
                socket.userId = data.id; 
                socket.emit('loginResult', { success: true, data: user.data });
            } else {
                socket.emit('loginResult', { success: false, msg: 'ID가 존재하지 않거나 비밀번호가 틀렸습니다.' });
            }
        } catch (err) {
            console.error('로그인 에러:', err);
            socket.emit('loginResult', { success: false, msg: '서버 DB 오류가 발생했습니다.' });
        }
    });

    // 3. 게임 데이터 자동 저장
    socket.on('saveData', async (data) => {
        if (socket.userId) {
            try {
                await User.updateOne({ id: socket.userId }, { $set: { data: data } });
            } catch (err) {
                console.error("데이터 영구 저장 실패:", err);
            }
        }
    });

    // 4. 멀티플레이 대기열 참가
    socket.on('joinQueue', () => {
        if(connectedPlayers.find(p => p.id === socket.id)) return;

        if (connectedPlayers.length < 2) {
            let role = connectedPlayers.length === 0 ? 'p1' : 'p2';
            connectedPlayers.push({ id: socket.id, role: role });
            socket.emit('roleAssign', role);
            
            if (connectedPlayers.length === 2) {
                io.emit('gameStart'); 
            }
        } else {
            socket.emit('message', '현재 방에서 게임이 진행 중입니다. 잠시 후 다시 시도해주세요.');
        }
    });

    // 5. 게임 내 상태 중계
    socket.on('playerState', (data) => socket.broadcast.emit('enemyState', data));

    // 6. 누군가 게임을 껐을 때
    socket.on('disconnect', () => {
        let index = connectedPlayers.findIndex(p => p.id === socket.id);
        if(index !== -1) {
            connectedPlayers.splice(index, 1);
            io.emit('playerLeft');
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`서버 실행 중... 포트: ${PORT}`));
