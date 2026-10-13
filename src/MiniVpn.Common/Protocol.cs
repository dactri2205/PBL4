using System.Buffers.Binary;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MiniVpn.Common;

public enum FrameType : byte { Login = 1, Welcome = 2, Denied = 3, Packet = 4 }
public sealed record Frame(FrameType Type, byte[] Data);
public sealed record Login(string User, string Password);
public sealed record Welcome(string Address);

public static class Protocol
{
    public const int MaxPayload = 2048;
    public const int MaxPacket = 1500;
    public const byte Version = 1;
    public static async Task WriteAsync(Stream stream, FrameType type, ReadOnlyMemory<byte> data, CancellationToken ct)
    {
        if (data.Length > MaxPayload) throw new InvalidDataException("Frame too large");
        byte[] header = new byte[6];
        header[0] = Version; header[1] = (byte)type;
        BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(2), data.Length);
        await stream.WriteAsync(header, ct);
        await stream.WriteAsync(data, ct);
        await stream.FlushAsync(ct);
    }
    public static async Task<Frame> ReadAsync(Stream stream, CancellationToken ct)
    {
        byte[] header = new byte[6];
        await stream.ReadExactlyAsync(header, ct);
        int length = BinaryPrimitives.ReadInt32BigEndian(header.AsSpan(2));
        if (header[0] != Version || !Enum.IsDefined((FrameType)header[1]) || length < 0 || length > MaxPayload)
            throw new InvalidDataException("Invalid frame header");
        byte[] data = new byte[length];
        await stream.ReadExactlyAsync(data, ct);
        return new Frame((FrameType)header[1], data);
    }
    public static byte[] Json<T>(T value) => JsonSerializer.SerializeToUtf8Bytes(value);
    public static T Parse<T>(byte[] data) => JsonSerializer.Deserialize<T>(data) ?? throw new InvalidDataException("Invalid JSON");
    public static byte[] Message(string value) => Encoding.UTF8.GetBytes(value);
}

public static class IpPolicy
{
    public static bool IsAllowed(ReadOnlySpan<byte> packet, byte[] source, byte[] destination, bool reply)
    {
        if (packet.Length < 20 || packet.Length > Protocol.MaxPacket || packet[0] >> 4 != 4) return false;
        int ihl = (packet[0] & 15) * 4;
        if (ihl < 20 || ihl > packet.Length || BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(2, 2)) != packet.Length) return false;
        if ((BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(6, 2)) & 0x3fff) != 0) return false; // no fragments
        if (!packet.Slice(12, 4).SequenceEqual(source) || !packet.Slice(16, 4).SequenceEqual(destination)) return false;
        if (packet[9] == 1) return packet.Length >= ihl + 8 && packet[ihl] == (reply ? 0 : 8); // ICMP echo
        if (packet[9] != 6 || packet.Length < ihl + 20) return false;
        ushort port = BinaryPrimitives.ReadUInt16BigEndian(packet.Slice(ihl + (reply ? 0 : 2), 2));
        return port == 8080;
    }
    public static byte[] Ip(string value) => IPAddress.Parse(value).GetAddressBytes();
}

public sealed record PasswordRecord(string Salt, string Hash, int Iterations);
public static class Passwords
{
    public const int Iterations = 310_000;
    public static PasswordRecord Create(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return new(Convert.ToBase64String(salt), Convert.ToBase64String(hash), Iterations);
    }
    public static bool Verify(string password, PasswordRecord record)
    {
        if (record.Iterations < 100_000 || record.Iterations > 2_000_000) return false;
        byte[] expected = Convert.FromBase64String(record.Hash);
        byte[] actual = Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(record.Salt), record.Iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
