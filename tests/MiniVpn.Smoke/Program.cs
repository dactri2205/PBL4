using System.Buffers.Binary;
using MiniVpn.Common;

int passed = 0;
void Check(bool valid, string name) { if (!valid) throw new Exception("FAILED: " + name); Console.WriteLine("PASS " + name); passed++; }

using var stream = new MemoryStream();
await Protocol.WriteAsync(stream, FrameType.Login, Protocol.Json(new Login("alice", "secret")), default);
stream.Position = 0;
Frame frame = await Protocol.ReadAsync(stream, default);
Check(frame.Type == FrameType.Login && Protocol.Parse<Login>(frame.Data).User == "alice", "frame roundtrip");
byte[] malformed = [2, 1, 0, 0, 0, 0];
try { await Protocol.ReadAsync(new MemoryStream(malformed), default); throw new Exception("Accepted version 2"); }
catch (InvalidDataException) { Check(true, "version reject"); }
malformed = [1, 4, 0, 0, 8, 1];
try { await Protocol.ReadAsync(new MemoryStream(malformed), default); throw new Exception("Accepted oversized frame"); }
catch (InvalidDataException) { Check(true, "size reject"); }
var record = Passwords.Create("correct horse battery staple");
Check(Passwords.Verify("correct horse battery staple", record) && !Passwords.Verify("wrong", record), "salted password hash");
Check(record.Salt != Passwords.Create("correct horse battery staple").Salt, "unique salt");
byte[] packet = new byte[40]; packet[0] = 0x45; packet[9] = 6;
BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(2), 40);
IpPolicy.Ip("10.8.0.2").CopyTo(packet, 12);
IpPolicy.Ip("10.8.0.1").CopyTo(packet, 16);
BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(22), 8080);
Check(IpPolicy.IsAllowed(packet, IpPolicy.Ip("10.8.0.2"), IpPolicy.Ip("10.8.0.1"), false), "web TCP allowed");
Check(!IpPolicy.IsAllowed(packet, IpPolicy.Ip("10.8.0.3"), IpPolicy.Ip("10.8.0.1"), false), "spoofed source rejected");
packet[16] = 8;
Check(!IpPolicy.IsAllowed(packet, IpPolicy.Ip("10.8.0.2"), IpPolicy.Ip("10.8.0.1"), false), "outside VPN rejected");
Console.WriteLine($"{passed} smoke checks passed");
