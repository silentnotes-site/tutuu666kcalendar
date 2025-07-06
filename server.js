const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const calendarsDir = path.join(__dirname, 'calendars');
if (!fs.existsSync(calendarsDir)) fs.mkdirSync(calendarsDir);

const usersFile = path.join(dataDir, 'users.json');
const eventsFile = path.join(dataDir, 'events.json');
const calendarsFile = path.join(dataDir, 'calendars.json');

let users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf8')) : [];
let events = fs.existsSync(eventsFile) ? JSON.parse(fs.readFileSync(eventsFile, 'utf8')) : [];
let calendars = fs.existsSync(calendarsFile) ? JSON.parse(fs.readFileSync(calendarsFile, 'utf8')) : [];

function saveUsers() { fs.writeFile(usersFile, JSON.stringify(users, null, 2), err => {}); }
function saveEvents() { fs.writeFile(eventsFile, JSON.stringify(events, null, 2), err => {}); }
function saveCalendars() { fs.writeFile(calendarsFile, JSON.stringify(calendars, null, 2), err => {}); }

app.post('/register', (req, res) => {
  const { username, password, email, displayName } = req.body;
  if (users.find(u => u.username === username))
    return res.status(400).json({ message: 'Utente già esistente' });
  const newUser = { username, password, email, displayName, userCode: Date.now().toString() };
  users.push(newUser);
  saveUsers();
  res.cookie('userCode', newUser.userCode, { httpOnly: true, secure: false });
  res.status(201).json({
    message: 'Registrazione avvenuta con successo',
    user: { username: newUser.username, email: newUser.email, displayName: newUser.displayName, userCode: newUser.userCode }
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(400).json({ message: 'Credenziali non valide' });
  if (user.banned) {
    const banDate = new Date(user.banInfo.date);
    const now = new Date();
    const diffDays = Math.floor((now - banDate) / (1000 * 60 * 60 * 24));
    if (diffDays < 30) {
      return res.status(403).json({
        message: `Account bannato. Riprova tra ${30 - diffDays} giorni.`,
        banRemainingDays: 30 - diffDays,
        reason: user.banInfo.reason
      });
    } else {
      user.banned = false;
      user.banInfo = null;
      saveUsers();
    }
  }
  res.cookie('userCode', user.userCode, { httpOnly: true, secure: false });
  res.status(200).json({
    message: 'Login effettuato con successo',
    user: { username: user.username, email: user.email, displayName: user.displayName, userCode: user.userCode }
  });
});

app.get('/get-user-profile', (req, res) => {
  if (req.query.userCode) {
    const user = users.find(u => u.userCode === req.query.userCode);
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });
    const { password, userCode, email, ...userData } = user; 
    res.status(200).json({ user: userData });
  } else if (req.query.username) {
    const user = users.find(u => u.username === req.query.username);
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });
    const { password, userCode, email, ...userData } = user; 
    res.status(200).json({ user: userData });
  } else {
    res.status(400).json({ message: 'Parametro non fornito' });
  }
});

app.post('/update-profile', (req, res) => {
  const { userCode, newPassword, newEmail, newDisplayName, description, profilePhoto } = req.body;
  const user = users.find(u => u.userCode === userCode);
  if (!user) return res.status(404).json({ message: 'Utente non trovato' });
  if (newPassword) user.password = newPassword;
  if (newEmail) user.email = newEmail;
  if (newDisplayName) user.displayName = newDisplayName;
  if (description !== undefined) user.biografia = description;
  if (profilePhoto !== undefined) user.fotoProfilo = profilePhoto;
  saveUsers();
  res.status(200).json({
    message: 'Profilo aggiornato',
    user: { username: user.username, email: user.email, displayName: user.displayName }
  });
});

app.post('/create-calendar', (req, res) => {
  const { calendarName, image, userCode } = req.body;
  const currentUserCode = req.cookies.userCode || userCode;
  if (!currentUserCode)
    return res.status(400).json({ message: 'Utente non autenticato' });
  const user = users.find(u => u.userCode === currentUserCode);
  if (!user) return res.status(404).json({ message: 'Utente non trovato' });
  if (!calendarName)
    return res.status(400).json({ message: 'Nome calendario non fornito' });
  const newCalendar = {
    id: Date.now().toString(),
    userCode: currentUserCode,
    calendarName,
    image: image ||
      'https://cdn.glitch.global/22d29c5f-8fa8-4652-916e-09a08a82c8a6/Screenshot%202025-03-16%20231719.png?v=1742163455582'
  };
  calendars.push(newCalendar);
  saveCalendars();
  const calendarLink = `${req.protocol}://${req.get('host')}/calendars/${newCalendar.id}`;
  res.status(201).json({
    message: 'Calendario creato',
    calendar: {
      id: newCalendar.id,
      calendarName: newCalendar.calendarName,
      image: newCalendar.image
    },
    link: calendarLink
  });
});

app.get('/get-calendars', (req, res) => {
  if (req.query.profileUsername) {
    const profileUser = users.find(u => u.username === req.query.profileUsername);
    if (!profileUser) return res.status(404).json({ message: 'Utente non trovato' });
    const userCalendars = calendars.filter(c => c.userCode === profileUser.userCode);
    const calendarInfo = userCalendars.map(calendar => ({
      id: calendar.id,
      calendarName: calendar.calendarName,
      image: calendar.image
    }));
    res.status(200).json({ calendars: calendarInfo });
  } else {
    const userCode = req.query.userCode || req.cookies.userCode;
    const user = users.find(u => u.userCode === userCode);
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });
    const userCalendars = calendars.filter(c => c.userCode === userCode);
    const calendarInfo = userCalendars.map(calendar => ({
      id: calendar.id,
      calendarName: calendar.calendarName,
      image: calendar.image
    }));
    res.status(200).json({ calendars: calendarInfo });
  }
});

app.post('/add-event', (req, res) => {
  const { userCode, title, start, description, calendarId } = req.body;
  const user = users.find(u => u.userCode === userCode);
  if (!user) return res.status(404).json({ message: 'Utente non trovato' });
  if (!calendars.find(c => c.id === calendarId))
    return res.status(400).json({ message: 'Calendario non trovato' });
  const newEvent = req.body.id
    ? { id: req.body.id, userCode, title, start, description, calendarId }
    : { id: Date.now().toString(), userCode, title, start, description, calendarId };
  events.push(newEvent);
  saveEvents();
  res.status(201).json({ message: 'Evento aggiunto', event: newEvent });
});

app.get('/events', (req, res) => {
  const userCode = req.query.userCode || req.cookies.userCode;
  const userEvents = events.filter(e => e.userCode === userCode);
  res.status(200).json({ events: userEvents });
});

app.delete('/delete-event', (req, res) => {
  const { eventId, userCode } = req.body;
  const eventIndex = events.findIndex(e => e.id === eventId && e.userCode === userCode);
  if (eventIndex === -1)
    return res.status(404).json({ message: 'Evento non trovato' });
  events.splice(eventIndex, 1);
  saveEvents();
  res.status(200).json({ message: 'Evento rimosso' });
});

app.get('/calendars/:calendarId', (req, res) => {
  const { calendarId } = req.params;
  const calendar = calendars.find(c => c.id === String(calendarId));
  if (!calendar) return res.status(404).send('Calendario non trovato');
  const calendarEvents = events
    .filter(e => e.calendarId === calendarId)
    .map(({ userCode, ...rest }) => rest);
  const calendarHtmlPath = path.join(calendarsDir, `${calendarId}.html`);
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="it">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${calendar.calendarName}</title>
    <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.0.0/index.css" rel="stylesheet" />
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background: #f7f7f7; }
      #calendar { max-width: 900px; margin: 40px auto; padding: 20px; background: #fff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    </style>
  </head>
  <body>
    <div id="calendar"></div>
    <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.0.0/index.global.min.js"></script>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        var calendarEl = document.getElementById('calendar');
        var calendar = new FullCalendar.Calendar(calendarEl, {
          initialView: 'dayGridMonth',
          events: ${JSON.stringify(calendarEvents)}
        });
        calendar.render();
      });
    </script>
  </body>
  </html>
  `;
  fs.writeFileSync(calendarHtmlPath, htmlContent);
  res.status(200).send(htmlContent);
});

app.post('/ban-user', (req, res) => {
  const { adminUsername, targetUsername, reason } = req.body;
  const adminUser = users.find(u => u.username === adminUsername);
  if (!adminUser || adminUser.username !== 'admin')
    return res.status(403).json({ message: 'Accesso negato: solo amministratori possono bannare utenti' });
  const targetUser = users.find(u => u.username === targetUsername);
  if (!targetUser) return res.status(404).json({ message: 'Utente non trovato' });
  targetUser.banned = true;
  targetUser.banInfo = { reason: reason || 'Motivo non specificato', date: new Date().toISOString() };
  saveUsers();
  res.status(200).json({ message: `Utente ${targetUser.username} bannato con successo` });
});

app.post('/unban-user', (req, res) => {
  const { adminUsername, targetUsername } = req.body;
  const adminUser = users.find(u => u.username === adminUsername);
  if (!adminUser || adminUser.username !== 'Jonh Doe')
    return res.status(403).json({ message: 'Accesso negato: solo amministratori possono rimuovere il ban' });
  const targetUser = users.find(u => u.username === targetUsername);
  if (!targetUser) return res.status(404).json({ message: 'Utente non trovato' });
  targetUser.banned = false;
  targetUser.banInfo = null;
  saveUsers();
  res.status(200).json({ message: `Ban rimosso per l'utente ${targetUser.username}` });
});

app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
