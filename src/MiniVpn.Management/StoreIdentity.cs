using System.Security.Cryptography;
using System.Text;

namespace MiniVpn.Management;

public sealed record StoreIdentity(string StoreId)
{
    public static StoreIdentity For(string path)
    {
        var fullPath = Path.GetFullPath(path);
        if (OperatingSystem.IsWindows()) fullPath = fullPath.ToUpperInvariant();
        return new(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(fullPath))));
    }
}
