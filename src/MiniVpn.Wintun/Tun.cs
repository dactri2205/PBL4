using System.ComponentModel;
using System.Runtime.InteropServices;

namespace MiniVpn.Wintun;

public sealed class Tun : IDisposable
{
    private IntPtr _adapter;
    private IntPtr _session;
    public uint InterfaceIndex { get; }
    public Tun(string name)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        _adapter = Native.WintunCreateAdapter(name, "MiniVpn", IntPtr.Zero);
        if (_adapter == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastPInvokeError(), "WintunCreateAdapter");
        try
        {
            Native.WintunGetAdapterLUID(_adapter, out ulong luid);
            int code = Native.ConvertInterfaceLuidToIndex(ref luid, out uint index);
            if (code != 0) throw new Win32Exception(code, "ConvertInterfaceLuidToIndex");
            InterfaceIndex = index;
            _session = Native.WintunStartSession(_adapter, 0x400000);
            if (_session == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastPInvokeError(), "WintunStartSession");
        }
        catch { Dispose(); throw; }
    }
    public byte[]? Receive(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            IntPtr packet = Native.WintunReceivePacket(_session, out uint length);
            if (packet != IntPtr.Zero)
            {
                try
                {
                    if (length == 0 || length > MiniVpn.Common.Protocol.MaxPacket) continue;
                    byte[] data = new byte[length];
                    Marshal.Copy(packet, data, 0, (int)length);
                    return data;
                }
                finally { Native.WintunReleaseReceivePacket(_session, packet); }
            }
            int error = Marshal.GetLastPInvokeError();
            if (error != 259) throw new Win32Exception(error, "WintunReceivePacket");
            IntPtr evt = Native.WintunGetReadWaitEvent(_session);
            if (evt == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastPInvokeError());
            Native.WaitForSingleObject(evt, 100);
        }
        return null;
    }
    public void Send(byte[] data)
    {
        if (data.Length == 0 || data.Length > MiniVpn.Common.Protocol.MaxPacket) throw new ArgumentOutOfRangeException(nameof(data));
        IntPtr packet = Native.WintunAllocateSendPacket(_session, (uint)data.Length);
        if (packet == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastPInvokeError(), "WintunAllocateSendPacket");
        Marshal.Copy(data, 0, packet, data.Length);
        Native.WintunSendPacket(_session, packet);
    }
    public void Dispose()
    {
        if (_session != IntPtr.Zero) { Native.WintunEndSession(_session); _session = IntPtr.Zero; }
        if (_adapter != IntPtr.Zero) { Native.WintunCloseAdapter(_adapter); _adapter = IntPtr.Zero; }
    }
}

internal static partial class Native
{
    [LibraryImport("wintun.dll", StringMarshalling = StringMarshalling.Utf16, SetLastError = true)] internal static partial IntPtr WintunCreateAdapter(string name, string tunnelType, IntPtr requestedGuid);
    [LibraryImport("wintun.dll")] internal static partial void WintunCloseAdapter(IntPtr adapter);
    [LibraryImport("wintun.dll")] internal static partial void WintunGetAdapterLUID(IntPtr adapter, out ulong luid);
    [LibraryImport("wintun.dll", SetLastError = true)] internal static partial IntPtr WintunStartSession(IntPtr adapter, uint capacity);
    [LibraryImport("wintun.dll")] internal static partial void WintunEndSession(IntPtr session);
    [LibraryImport("wintun.dll", SetLastError = true)] internal static partial IntPtr WintunReceivePacket(IntPtr session, out uint size);
    [LibraryImport("wintun.dll")] internal static partial void WintunReleaseReceivePacket(IntPtr session, IntPtr packet);
    [LibraryImport("wintun.dll", SetLastError = true)] internal static partial IntPtr WintunAllocateSendPacket(IntPtr session, uint size);
    [LibraryImport("wintun.dll")] internal static partial void WintunSendPacket(IntPtr session, IntPtr packet);
    [LibraryImport("wintun.dll", SetLastError = true)] internal static partial IntPtr WintunGetReadWaitEvent(IntPtr session);
    [LibraryImport("kernel32.dll")] internal static partial uint WaitForSingleObject(IntPtr handle, uint timeout);
    [LibraryImport("Iphlpapi.dll")] internal static partial int ConvertInterfaceLuidToIndex(ref ulong luid, out uint index);
}
