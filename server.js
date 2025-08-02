const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());

// Conexão com MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/visitswap', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Importar modelos
require('./models/User');
require('./models/Site');
require('./models/VisitLog');
require('./models/CreditLog');

const User = mongoose.model('User');
const Site = mongoose.model('Site');
const VisitLog = mongoose.model('VisitLog');
const CreditLog = mongoose.model('CreditLog');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-visitswap-2025-forte-e-aleatorio';

// Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Middleware de autenticação
const auth = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Acesso negado.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token inválido.' });
  }
};

// Rotas

// Registro
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email já cadastrado.' });

    const hashed = await bcrypt.hash(password, 10);
    const token = Math.random().toString(36).substr(2, 10);

    const user = new User({ name, email, password: hashed, verificationToken: token });
    await user.save();

    await transporter.sendMail({
      to: email,
      subject: 'Confirme seu email no VisitSwap',
      html: `<p>Clique: <a href="${process.env.FRONTEND_URL}/verify/${token}">Confirmar Email</a></p>`,
    });

    res.status(201).json({ message: 'Usuário criado! Verifique seu email.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor.' });
  }
});

// Verificação de email
app.get('/api/verify/:token', async (req, res) => {
  try {
    const user = await User.findOne({ verificationToken: req.params.token });
    if (!user) return res.status(400).json({ message: 'Token inválido.' });

    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    res.redirect(`${process.env.FRONTEND_URL}/login?verified=true`);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao verificar.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.verified) return res.status(400).json({ message: 'Credenciais inválidas.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Credenciais inválidas.' });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, credits: user.credits }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor.' });
  }
});

// Recuperação de senha
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Email não encontrado.' });

    const token = Math.random().toString(36).substr(2, 10);
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    await transporter.sendMail({
      to: email,
      subject: 'Redefina sua senha no VisitSwap',
      html: `<p><a href="${process.env.FRONTEND_URL}/reset/${token}">Redefinir senha</a></p>`,
    });

    res.json({ message: 'Email enviado.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor.' });
  }
});

app.post('/api/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Token inválido.' });

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Senha redefinida!' });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor.' });
  }
});

// Rotas protegidas

app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Erro.' });
  }
});

app.post('/api/sites', auth, async (req, res) => {
  try {
    const { title, url } = req.body;
    const site = new Site({ userId: req.userId, title, url });
    await site.save();
    res.status(201).json(site);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/sites', auth, async (req, res) => {
  try {
    const sites = await Site.find({ userId: req.userId });
    res.json(sites);
  } catch (error) {
    res.status(500).json({ message: 'Erro.' });
  }
});

app.get('/api/sites/browse', auth, async (req, res) => {
  try {
    const userSites = await Site.find({ userId: req.userId });
    const ids = userSites.map(s => s._id);
    const sites = await Site.find({ _id: { $nin: ids }, status: 'ativo' });
    res.json(sites);
  } catch (error) {
    res.status(500).json({ message: 'Erro.' });
  }
});

app.post('/api/visits/complete', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { siteId, ip } = req.body;
    const site = await Site.findById(siteId).session(session);
    if (!site) throw new Error('Site não encontrado.');

    const user = await User.findById(req.userId).session(session);
    user.credits += 1;
    await user.save({ session });

    const visit = new VisitLog({ visitorId: req.userId, siteId, ip });
    await visit.save({ session });

    site.visitsReceived += 1;
    await site.save({ session });

    const log = new CreditLog({
      userId: req.userId,
      type: 'ganho',
      amount: 1,
      reason: 'Visita concluída',
      relatedId: visit._id,
      relatedModel: 'VisitLog'
    });
    await log.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, credits: user.credits });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: 'Erro ao registrar visita.' });
  }
});

app.get('/api/credits/history', auth, async (req, res) => {
  try {
    const logs = await CreditLog.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Erro.' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});