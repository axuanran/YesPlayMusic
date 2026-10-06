import { spawn } from 'node:child_process';

// Pin/unpin a window to all Windows virtual desktops (same position on every
// desktop). Windows has no supported API for this; the implementation talks
// to the shell's undocumented IVirtualDesktopPinnedApps COM interface, the
// same approach used by MScholtes/PSVirtualDesktop and similar tools. The C#
// interop source is compiled at runtime by the in-box Windows PowerShell
// (powershell.exe 5.1), so no native dependency ships with the app. Interface
// GUIDs differ between Windows builds, so the source is patched per OS build.
// Any failure resolves to false and the app keeps working without the pin.

const TIMEOUT_MS = 15000;

const PINNER_SCRIPT = String.raw`
$OSBuild = $PSVersionTable.BuildVersion.Build
if (-not $OSBuild) { $OSBuild = [Environment]::OSVersion.Version.Build }
if ($OSBuild -lt 14393) { Write-Error 'Windows 10 1607 or above is required'; exit 1 }

if ($OSBuild -lt 17134) {
  $AppViewGuid = '9AC0B5C8-1484-4C5B-9533-4134A0F97CEA'
  $AppViewIfaceType = 'InterfaceIsIUnknown'
  $AppViewCollectionGuid = '2C08ADF0-A386-4B35-9250-0FE183476FCC'
} elseif ($OSBuild -lt 17661) {
  $AppViewGuid = '871F602A-2B58-42B4-8C4B-6C43D642C06F'
  $AppViewIfaceType = 'InterfaceIsIInspectable'
  $AppViewCollectionGuid = '2C08ADF0-A386-4B35-9250-0FE183476FCC'
} else {
  $AppViewGuid = '372E1D3B-38D3-42E4-A15B-8AB2B178F513'
  $AppViewIfaceType = 'InterfaceIsIInspectable'
  $AppViewCollectionGuid = '1841C6D7-4F9D-42C0-AF41-8747538F10E5'
}

$Source = @'
using System;
using System.Runtime.InteropServices;

namespace YpmVirtualDesktop
{
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("6D5140C1-7436-11CE-8034-00AA006009FA")]
  internal interface IServiceProvider10
  {
    [return: MarshalAs(UnmanagedType.IUnknown)]
    object QueryService(ref Guid service, ref Guid riid);
  }

  [ComImport, InterfaceType(ComInterfaceType.__APPVIEW_IFACETYPE__), Guid("__APPVIEW_GUID__")]
  internal interface IApplicationView { }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("__APPVIEWCOLLECTION_GUID__")]
  internal interface IApplicationViewCollection
  {
    int GetViews(out IntPtr array);
    int GetViewsByZOrder(out IntPtr array);
    int GetViewsByAppUserModelId(string id, out IntPtr array);
    int GetViewForHwnd(IntPtr hwnd, out IApplicationView view);
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("4CE81583-1E4C-4632-A621-07A53543148F")]
  internal interface IVirtualDesktopPinnedApps
  {
    bool IsAppIdPinned(string appId);
    void PinAppID(string appId);
    void UnpinAppID(string appId);
    bool IsViewPinned(IApplicationView view);
    void PinView(IApplicationView view);
    void UnpinView(IApplicationView view);
  }

  public static class DesktopPin
  {
    private static readonly Guid CLSID_ImmersiveShell = new Guid("C2F03A33-21F5-47FA-B4BB-156362A2F239");
    private static readonly Guid CLSID_VirtualDesktopPinnedApps = new Guid("B5A399E7-1C87-46B8-88E9-FC5747B171BD");

    private static IServiceProvider10 Shell()
    {
      return (IServiceProvider10)Activator.CreateInstance(Type.GetTypeFromCLSID(CLSID_ImmersiveShell));
    }

    private static IApplicationView ViewForHwnd(IntPtr hwnd)
    {
      Guid collectionIid = typeof(IApplicationViewCollection).GUID;
      var collection = (IApplicationViewCollection)Shell().QueryService(ref collectionIid, ref collectionIid);
      IApplicationView view;
      int hr = collection.GetViewForHwnd(hwnd, out view);
      Marshal.ThrowExceptionForHR(hr);
      return view;
    }

    public static void PinWindow(IntPtr hwnd)
    {
      Guid service = CLSID_VirtualDesktopPinnedApps;
      Guid iid = typeof(IVirtualDesktopPinnedApps).GUID;
      var pinned = (IVirtualDesktopPinnedApps)Shell().QueryService(ref service, ref iid);
      pinned.PinView(ViewForHwnd(hwnd));
    }

    public static void UnpinWindow(IntPtr hwnd)
    {
      Guid service = CLSID_VirtualDesktopPinnedApps;
      Guid iid = typeof(IVirtualDesktopPinnedApps).GUID;
      var pinned = (IVirtualDesktopPinnedApps)Shell().QueryService(ref service, ref iid);
      pinned.UnpinView(ViewForHwnd(hwnd));
    }
  }
}
'@

$Source = $Source.Replace('__APPVIEW_GUID__', $AppViewGuid)
$Source = $Source.Replace('__APPVIEW_IFACETYPE__', $AppViewIfaceType)
$Source = $Source.Replace('__APPVIEWCOLLECTION_GUID__', $AppViewCollectionGuid)

Add-Type -Language CSharp -TypeDefinition $Source -ErrorAction Stop
`;

// -Command consumes every remaining token as the command text, so the final
// COM call is baked into the script instead of passed as arguments.
export function buildPinnerCommand({ hwnd, pinned } = {}) {
  const method = pinned === true ? 'PinWindow' : 'UnpinWindow';
  return `${PINNER_SCRIPT}\n[YpmVirtualDesktop.DesktopPin]::${method}([IntPtr]::new(${hwnd}))`;
}

export const DEFAULT_PINNER_PATH = 'powershell.exe';

// Resolve once the shell has been told to pin (true) or unpin (false) the
// window. Rejects only on operational errors (spawn failure, timeout, script
// error); the promise result is always a boolean for "reached the COM call".
export function setWindowPinnedOnAllDesktops({
  hwnd,
  pinned,
  spawnCommand = spawn,
  powershellPath = DEFAULT_PINNER_PATH,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  if (!Number.isInteger(hwnd) || hwnd <= 0) {
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    let child;
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child?.kill();
      resolve(false);
    }, timeoutMs);
    try {
      child = spawnCommand(
        powershellPath,
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          buildPinnerCommand({ hwnd, pinned }),
        ],
        { windowsHide: true }
      );
    } catch {
      clearTimeout(timer);
      resolve(false);
      return;
    }
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.stdout?.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn(
          'Failed to pin desktop lyrics window to all virtual desktops:',
          (stderr || stdout || `exit ${code}`).slice(0, 300)
        );
      }
      resolve(code === 0);
    });
  });
}

export { PINNER_SCRIPT };
