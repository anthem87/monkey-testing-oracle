import http from 'http';
import url from 'url';

const PORT = 9000;

// Simulazione semplice di una pagina di login
const loginPageHTML = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login Test Page</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 50px; 
            background-color: #f5f5f5;
        }
        .login-form { 
            max-width: 400px; 
            margin: 0 auto; 
            padding: 30px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .form-group { 
            margin-bottom: 20px; 
        }
        label { 
            display: block; 
            margin-bottom: 5px; 
            font-weight: bold;
        }
        input[type="text"], 
        input[type="password"] { 
            width: 100%; 
            padding: 10px; 
            border: 1px solid #ddd; 
            border-radius: 4px;
            box-sizing: border-box;
        }
        button { 
            width: 100%; 
            padding: 12px; 
            background-color: #007bff; 
            color: white; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer;
            font-size: 16px;
        }
        button:hover { 
            background-color: #0056b3; 
        }
        .error { 
            color: red; 
            margin-top: 10px; 
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-form">
        <h2>Login Test Page</h2>
        <form id="loginForm" method="POST" action="/login">
            <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
            </div>
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit">Login</button>
            <div id="error" class="error"></div>
        </form>
    </div>
    
    <script>
        document.getElementById('loginForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('error');
            
            // Simulazione logica di login
            fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Reindirizza alla dashboard in caso di successo
                    window.location.href = '/dashboard';
                } else {
                    // Mostra messaggio di errore
                    errorDiv.textContent = data.message || 'Login fallito';
                    errorDiv.style.display = 'block';
                }
            })
            .catch(error => {
                errorDiv.textContent = 'Errore di connessione';
                errorDiv.style.display = 'block';
            });
        });
    </script>
</body>
</html>
`;

const dashboardHTML = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Login Test</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 50px; 
            background-color: #f5f5f5;
        }
        .dashboard { 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 30px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .welcome { 
            color: #28a745; 
            font-size: 24px; 
            margin-bottom: 20px;
        }
        .logout-btn {
            background-color: #dc3545;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <h1 class="welcome">Benvenuto nella Dashboard!</h1>
        <p>Login effettuato con successo.</p>
        <p>Utente: <strong>luigi.verdi</strong></p>
        <a href="/" class="logout-btn">Logout</a>
    </div>
</body>
</html>
`;

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url!, true);
    const path = parsedUrl.pathname;
    
    // CORS headers per permettere le richieste AJAX
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    console.log(`${new Date().toISOString()} - ${req.method} ${path}`);
    
    if (path === '/' && req.method === 'GET') {
        // Serve la pagina di login
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(loginPageHTML);
        
    } else if (path === '/login' && req.method === 'POST') {
        // Gestisce il login
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);
                console.log(`Tentativo di login: ${username} / ${password}`);
                
                // Logica di autenticazione simulata
                if (username === 'luigi.verdi' && password === 'admin') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Login riuscito' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Credenziali non valide' }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Errore nel parsing dei dati' }));
            }
        });
        
    } else if (path === '/dashboard' && req.method === 'GET') {
        // Serve la dashboard (pagina di successo)
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(dashboardHTML);
        
    } else {
        // 404 per altre richieste
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Pagina non trovata');
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Server di test in esecuzione su http://localhost:${PORT}`);
    console.log(`📝 Credenziali di test: luigi.verdi / admin`);
    console.log(`⏹️  Per fermare il server: Ctrl+C`);
});

// Gestione chiusura graceful
process.on('SIGINT', () => {
    console.log('\\n🛑 Chiusura server di test...');
    server.close(() => {
        console.log('✅ Server chiuso correttamente');
        process.exit(0);
    });
});

export default server;