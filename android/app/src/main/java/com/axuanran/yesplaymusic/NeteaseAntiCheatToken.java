package com.axuanran.yesplaymusic;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Obtains the fresh NetEase/Yidun Watchman token required by protected write
 * APIs such as playlist subscribe/unsubscribe.
 *
 * api-enhanced obtains this token from the official Watchman Web SDK for every
 * protected request. Android already embeds WebView, so doing the same locally
 * keeps the direct native API implementation self-contained.
 */
final class NeteaseAntiCheatToken {
    private static final String BASE_URL = "https://music.163.com/";
    private static final String TOOL_JS_URL = "https://acstatic-dun.126.net/tool.min.js";
    private static final String PRODUCT_NUMBER = "YD00000558929251";
    private static final String BUSINESS_ID = "bd5d2f973ef74cd2a61325a412ae54d9";
    private static final String WEB_USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";

    private NeteaseAntiCheatToken() {}

    static String fetch(Activity activity, long timeoutMs) {
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            return "";
        }

        long waitMs = Math.max(5000L, Math.min(timeoutMs, 20000L));
        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean completed = new AtomicBoolean(false);
        AtomicReference<String> token = new AtomicReference<>("");
        AtomicReference<WebView> webViewRef = new AtomicReference<>();

        Runnable destroyWebView = () -> {
            WebView webView = webViewRef.getAndSet(null);
            if (webView == null) return;
            webView.stopLoading();
            webView.removeJavascriptInterface("YpmAntiCheat");
            webView.destroy();
        };

        TokenCallback callback = value -> {
            if (!completed.compareAndSet(false, true)) return;
            token.set(value == null ? "" : value);
            latch.countDown();
            activity.runOnUiThread(destroyWebView);
        };

        activity.runOnUiThread(
            () -> createTokenWebView(
                activity,
                webViewRef,
                completed,
                callback
            )
        );

        try {
            if (!latch.await(waitMs, TimeUnit.MILLISECONDS)) {
                completed.compareAndSet(false, true);
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            completed.compareAndSet(false, true);
        } finally {
            activity.runOnUiThread(destroyWebView);
        }
        return token.get();
    }

    @SuppressLint({ "SetJavaScriptEnabled", "JavascriptInterface" })
    private static void createTokenWebView(
        Activity activity,
        AtomicReference<WebView> webViewRef,
        AtomicBoolean completed,
        TokenCallback callback
    ) {
        if (
            completed.get() ||
            activity.isFinishing() ||
            activity.isDestroyed()
        ) {
            return;
        }

        WebView webView = new WebView(activity);
        webViewRef.set(webView);
        if (completed.get()) {
            webViewRef.compareAndSet(webView, null);
            webView.destroy();
            return;
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(WEB_USER_AGENT);

        webView.addJavascriptInterface(new TokenBridge(callback), "YpmAntiCheat");
        webView.loadDataWithBaseURL(
            BASE_URL,
            buildPage(),
            "text/html",
            "UTF-8",
            null
        );
    }

    private static String buildPage() {
        return "<!doctype html><html><head><meta charset=\"UTF-8\"></head><body>" +
            "<script src=\"" + TOOL_JS_URL + "\"></script>" +
            "<script>(function(){" +
            "var done=false;" +
            "function finish(token){if(done)return;done=true;" +
            "try{YpmAntiCheat.onToken(typeof token==='string'?token:'');}catch(e){}}" +
            "function getToken(instance){try{" +
            "var issued=false;" +
            "function issue(){if(issued)return;issued=true;" +
            "instance.getToken('" + BUSINESS_ID + "',function(token){finish(token);});}" +
            "var raw=instance.getInstance&&instance.getInstance();" +
            "if(raw&&typeof raw.I==='function'){raw.I(issue);setTimeout(issue,5000);}else{issue();}" +
            "}catch(e){finish('');}}" +
            "function boot(){" +
            "if(typeof initWatchman!=='function'){setTimeout(boot,100);return;}" +
            "try{initWatchman({auto:true,productNumber:'" + PRODUCT_NUMBER + "'," +
            "onload:function(instance){getToken(instance);}," +
            "onerror:function(){finish('');}});}catch(e){finish('');}}" +
            "setTimeout(function(){finish('');},15000);boot();" +
            "})();</script></body></html>";
    }

    private interface TokenCallback {
        void complete(String token);
    }

    private static final class TokenBridge {
        private final TokenCallback callback;

        TokenBridge(TokenCallback callback) {
            this.callback = callback;
        }

        @JavascriptInterface
        public void onToken(String token) {
            callback.complete(token);
        }
    }
}
