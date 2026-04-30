const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const path = require('path');
const mongoose = require('mongoose'); // 몽고DB 라이브러리 불러오기

// HTML 파일을 띄워주기 위한 설정
app.use(express.static(__dirname));
app.use(express.static('public'));

// ==========================================
// 영구 데이터베이스(MongoDB) 설정
// ==========================================
// 🚨 여기에 MongoDB Atlas에서 복사한 주소를 넣으세요! 🚨
// 예시: 'mongodb+srv://아이디:비밀번호@cluster0...mongodb.net/?retryWrites=true&w=majority'
const MONGO_URI = mongodb+srv://<db_dumbaera_9281_play>:<db_Gu0NVkLLh005AnBJ>@cluster0.fkzqfyl.mongodb.net/?appName=Cluster0;

// 몽고DB 연결 시도
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB(데이터베이스) 영구 연결 성공!'))
    .catch(err => console.log('❌ MongoDB 연결 실패:', err));

// 유저 데이터의 '설계도(Schema)' 정의
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // 아이디 (중복 불가)
    pw: { type: String, required: true },               // 비밀번호
    data: { type: Object, default: null }               // 게임 데이터 (전적, 스킬 등)
});

// 설계도를 바탕으로 User 모델 생성
const User = mongoose.model('User', userSchema);

let connectedPlayers = [];

io.on('connection', (socket) => {
    console.log('기기 접속! Socket ID:', socket.id);

    // 1. 회원가입 로직 (DB 연동)
    socket.on('register', async (data) => {
        if (!data.id || !data.pw) {
            return socket.emit('registerResult', { success: false, msg: 'ID와 비밀번호를 모두 입력해주세요.' });
        }
        try {
            // DB에서 해당 ID가 이미 존재하는지 검색
            const existingUser = await User.findOne({ id: data.id });
            if (existingUser) {
                socket.emit('registerResult', { success: false, msg: '이미 사용 중인 ID입니다. 다른 ID를 입력해주세요.' });
            } else {
                // DB에 새로운 유저 영구 저장
                const newUser = new User({ id: data.id, pw: data.pw, data: null });
                await newUser.save();
                socket.emit('registerResult', { success: true });
            }
        } catch (err) {
            console.error('회원가입 에러:', err);
            socket.emit('registerResult', { success: false, msg: '서버 DB 오류가 발생했습니다.' });
        }
    });

    // 2. 로그인 로직 (DB 연동)
    socket.on('login', async (data) => {
        try {
            // DB에서 ID로 유저 검색
            const user = await User.findOne({ id: data.id });
            if (user && user.pw === data.pw) {
                // 로그인 성공 시 해당 소켓에 유저 ID 기억
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

    // 3. 게임 데이터 자동 저장 (클라이언트에서 요청이 올 때마다 DB 덮어쓰기)
    socket.on('saveData', async (data) => {
        if (socket.userId) {
            try {
                // 해당 유저의 data 항목을 통째로 덮어씌움
                await User.updateOne({ id: socket.userId }, { $set: { data: data } });
            } catch (err) {
                console.error("데이터 영구 저장 실패:", err);
            }
        }
    });

    // 4. 멀티플레이 대기열 참가
    socket.on('joinQueue', () => {
        // 중복 참가 방지
        if(connectedPlayers.find(p => p.id === socket.id)) return;

        if (connectedPlayers.length < 2) {
            let role = connectedPlayers.length === 0 ? 'p1' : 'p2';
            connectedPlayers.push({ id: socket.id, role: role });
            socket.emit('roleAssign', role);
            
            // 두 명이 모이면 게임 시작
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
            io.emit('playerLeft'); // 남은 사람에게 부전승 처리
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`서버 실행 중... 포트: ${PORT}`));
