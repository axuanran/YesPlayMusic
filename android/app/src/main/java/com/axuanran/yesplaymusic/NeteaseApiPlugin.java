package com.axuanran.yesplaymusic;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.X509EncodedKeySpec;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

@CapacitorPlugin(name = "NeteaseApi")
public class NeteaseApiPlugin extends Plugin {
    private static final String MUSIC_DOMAIN = "https://music.163.com";
    private static final String API_DOMAIN = "https://interface.music.163.com";
    private static final String IV = "0102030405060708";
    private static final String PRESET_KEY = "0CoJUm6Qyw8W8jud";
    private static final String EAPI_KEY = "e82ckenh8dichen8";
    private static final String BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final String PUBLIC_KEY_DER =
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB";
    private static final String WEB_USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
    private static final String APP_USER_AGENT =
        "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)";

    private final SecureRandom secureRandom = new SecureRandom();
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void openWebLogin(PluginCall call) {
        Intent intent = new Intent(getContext(), NeteaseLoginActivity.class);
        startActivityForResult(call, intent, "handleWebLoginResult");
    }

    @ActivityCallback
    private void handleWebLoginResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        JSObject response = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null) {
            response.put(
                "cookie",
                data.getStringExtra(NeteaseLoginActivity.RESULT_COOKIE)
            );
        } else {
            response.put("cookie", "");
        }
        call.resolve(response);
    }

    @PluginMethod
    public void request(PluginCall call) {
        final String uri = call.getString("uri", "");
        final String crypto = call.getString("crypto", "eapi");
        final String cookie = call.getString("cookie", "");
        final String realIP = call.getString("realIP", "");
        final Integer timeout = call.getInt("timeout", 15000);
        final JSObject input = call.getObject("data", new JSObject());

        if (!uri.startsWith("/api/")) {
            call.reject("Unsupported NetEase API URI: " + uri);
            return;
        }

        executor.execute(() -> {
            try {
                JSObject result = execute(uri, crypto, input, cookie, realIP, timeout);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? error.toString() : error.getMessage(), error);
            }
        });
    }

    private JSObject execute(
        String uri,
        String crypto,
        JSObject input,
        String cookie,
        String realIP,
        int timeout
    ) throws Exception {
        JSONObject data = new JSONObject(input.toString());
        data.put("e_r", false);

        String target;
        JSONObject form;
        String requestCookie;
        if ("weapi".equals(crypto)) {
            data.put("csrf_token", readCookie(cookie, "__csrf"));
            target = MUSIC_DOMAIN + "/weapi/" + uri.substring(5);
            form = encryptWeapi(data.toString());
            requestCookie = buildRequestCookie(cookie);
        } else if ("api".equals(crypto)) {
            target = API_DOMAIN + uri;
            form = data;
            requestCookie = buildRequestCookie(cookie);
        } else {
            JSONObject header = buildEapiHeader(cookie);
            data.put("header", header);
            target = API_DOMAIN + "/eapi/" + uri.substring(5);
            form = new JSONObject();
            form.put("params", encryptEapi(uri, data.toString()));
            requestCookie = buildEapiCookie(header);
        }

        HttpURLConnection connection = (HttpURLConnection) new URL(target).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(timeout);
        connection.setReadTimeout(timeout);
        connection.setDoOutput(true);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded;charset=utf-8");
        connection.setRequestProperty("Accept", "application/json,text/plain,*/*");
        connection.setRequestProperty("Referer", MUSIC_DOMAIN + "/");
        connection.setRequestProperty("User-Agent", "weapi".equals(crypto) ? WEB_USER_AGENT : APP_USER_AGENT);
        connection.setRequestProperty("Cookie", requestCookie);
        if (!realIP.isEmpty()) {
            connection.setRequestProperty("X-Real-IP", realIP);
            connection.setRequestProperty("X-Forwarded-For", realIP);
        }

        byte[] body = encodeForm(form).getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(body.length);
        connection.getOutputStream().write(body);

        int status = connection.getResponseCode();
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String responseBody = readStream(stream);
        JSObject response = new JSObject();
        try {
            response.put("data", new JSObject(responseBody));
        } catch (JSONException ignored) {
            JSObject fallback = new JSObject();
            fallback.put("code", status);
            fallback.put("message", responseBody);
            response.put("data", fallback);
        }
        response.put("status", status);
        response.put("cookies", collectCookies(connection));
        connection.disconnect();
        return response;
    }

    private JSONObject encryptWeapi(String text) throws Exception {
        StringBuilder key = new StringBuilder(16);
        for (int i = 0; i < 16; i++) {
            key.append(BASE62.charAt(secureRandom.nextInt(BASE62.length())));
        }
        String first = aesCbcBase64(text, PRESET_KEY);
        String second = aesCbcBase64(first, key.toString());
        String reversed = key.reverse().toString();

        byte[] der = Base64.decode(PUBLIC_KEY_DER, Base64.DEFAULT);
        PublicKey publicKey = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        Cipher rsa = Cipher.getInstance("RSA/ECB/NoPadding");
        rsa.init(Cipher.ENCRYPT_MODE, publicKey);
        byte[] encrypted = rsa.doFinal(reversed.getBytes(StandardCharsets.UTF_8));

        JSONObject result = new JSONObject();
        result.put("params", second);
        result.put("encSecKey", toHex(encrypted).toLowerCase(Locale.ROOT));
        return result;
    }

    private String encryptEapi(String uri, String text) throws Exception {
        String message = "nobody" + uri + "use" + text + "md5forencrypt";
        String digest = md5(message);
        String payload = uri + "-36cd479b6b5-" + text + "-36cd479b6b5-" + digest;
        Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(EAPI_KEY.getBytes(StandardCharsets.UTF_8), "AES"));
        return toHex(cipher.doFinal(payload.getBytes(StandardCharsets.UTF_8))).toUpperCase(Locale.ROOT);
    }

    private String aesCbcBase64(String value, String key) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(
            Cipher.ENCRYPT_MODE,
            new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES"),
            new IvParameterSpec(IV.getBytes(StandardCharsets.UTF_8))
        );
        return Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    private JSONObject buildEapiHeader(String cookie) throws JSONException {
        JSONObject header = new JSONObject();
        header.put("osver", "14");
        header.put("deviceId", "yesplaymusic-android");
        header.put("os", "android");
        header.put("appver", "9.1.65");
        header.put("versioncode", "9001065");
        header.put("buildver", String.valueOf(System.currentTimeMillis() / 1000));
        header.put("resolution", "1080x2400");
        header.put("channel", "netease");
        header.put("requestId", System.currentTimeMillis() + "_" + secureRandom.nextInt(1000));
        header.put("__csrf", readCookie(cookie, "__csrf"));
        String musicU = readCookie(cookie, "MUSIC_U");
        String musicA = readCookie(cookie, "MUSIC_A");
        if (!musicU.isEmpty()) header.put("MUSIC_U", musicU);
        if (!musicA.isEmpty()) header.put("MUSIC_A", musicA);
        return header;
    }

    private String buildRequestCookie(String cookie) {
        StringBuilder result = new StringBuilder(cookie == null ? "" : cookie.trim());
        appendCookie(result, "__remember_me", "true");
        appendCookie(result, "os", "android");
        appendCookie(result, "appver", "9.1.65");
        return result.toString();
    }

    private String buildEapiCookie(JSONObject header) throws Exception {
        List<String> pairs = new ArrayList<>();
        Iterator<String> keys = header.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            pairs.add(
                URLEncoder.encode(key, StandardCharsets.UTF_8.name()) + "=" +
                URLEncoder.encode(String.valueOf(header.get(key)), StandardCharsets.UTF_8.name())
            );
        }
        return String.join("; ", pairs);
    }

    private void appendCookie(StringBuilder target, String key, String value) {
        if (target.indexOf(key + "=") >= 0) return;
        if (target.length() > 0 && target.charAt(target.length() - 1) != ';') target.append("; ");
        target.append(key).append('=').append(value);
    }

    private String readCookie(String cookie, String key) {
        if (cookie == null) return "";
        for (String part : cookie.split(";")) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length == 2 && key.equals(pair[0])) return pair[1];
        }
        return "";
    }

    private JSArray collectCookies(HttpURLConnection connection) {
        List<String> cookies = new ArrayList<>();
        for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
            if (entry.getKey() == null || !"set-cookie".equalsIgnoreCase(entry.getKey())) continue;
            for (String value : entry.getValue()) {
                cookies.add(value.split(";", 2)[0]);
            }
        }
        return JSArray.from(cookies);
    }

    private String encodeForm(JSONObject form) throws Exception {
        List<String> pairs = new ArrayList<>();
        Iterator<String> keys = form.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = form.get(key);
            pairs.add(
                URLEncoder.encode(key, StandardCharsets.UTF_8.name()) + "=" +
                URLEncoder.encode(String.valueOf(value), StandardCharsets.UTF_8.name())
            );
        }
        return String.join("&", pairs);
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    private String md5(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("MD5");
        return toHex(digest.digest(value.getBytes(StandardCharsets.UTF_8))).toLowerCase(Locale.ROOT);
    }

    private String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }
}
