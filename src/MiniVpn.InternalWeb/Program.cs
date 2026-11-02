using System.Net;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Loopback, 18080));

var app = builder.Build();

app.MapGet("/", () => Results.Content($$"""
    <!doctype html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Website nội bộ | MiniVPN</title>
      <style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f1f5f9; color: #0f172a; font: 16px/1.6 system-ui, sans-serif; }
        main { box-sizing: border-box; width: min(560px, calc(100% - 32px)); padding: 40px; border-radius: 20px; background: white; box-shadow: 0 16px 48px #0f172a14; }
        .tag { color: #1d4ed8; font-size: 14px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        h1 { margin: 8px 0 16px; font-size: clamp(28px, 5vw, 40px); line-height: 1.2; }
        p { margin: 0 0 16px; }
        code { padding: 3px 7px; border-radius: 6px; background: #eff6ff; color: #1d4ed8; }
        small { color: #64748b; }
      </style>
    </head>
    <body>
      <main>
        <div class="tag">MiniVPN · PBL4</div>
        <h1>Website nội bộ</h1>
        <p>Trang này chạy trên laptop A và được cung cấp cho máy khách qua đường hầm VPN.</p>
        <p>Địa chỉ truy cập từ máy khách: <code>http://10.8.0.1:8080</code></p>
        <small>Thời gian máy chủ: {{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz}}</small>
      </main>
    </body>
    </html>
    """, "text/html; charset=utf-8"));

app.Run();
