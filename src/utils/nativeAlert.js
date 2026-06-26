/**
 * Returns an alert-like function that fits current runtime environment
 *
 * This function is amid to solve a electron bug on Windows, that, when
 * user dismissed a browser alert, <input> elements cannot be focused
 * for further editing unless switching to another window and then back
 *
 * @returns { (message:string) => void }
 * Built-in alert function for browser environment
 * A function wrapping {@link dialog.showMessageBoxSync} for electron environment
 *
 * @see {@link https://github.com/electron/electron/issues/19977} for upstream electron issue
 */
const nativeAlert = (() => {
  if (process.env.IS_ELECTRON === true) {
    return message => {
      if (window.electronAPI?.app?.showNativeAlert) {
        window.electronAPI.app.showNativeAlert(message);
      } else {
        alert(message);
      }
    };
  }
  return alert;
})();

export default nativeAlert;
