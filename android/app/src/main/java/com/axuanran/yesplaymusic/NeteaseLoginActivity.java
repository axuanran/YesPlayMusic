package com.axuanran.yesplaymusic;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

public class NeteaseLoginActivity extends AppCompatActivity {
    public static final String RESULT_COOKIE = "netease_cookie";

    private static final String LOGIN_URL = "https://music.163.com/#/login";
    private static final long COOKIE_CHECK_INTERVAL_MS = 500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable cookieCheck = new Runnable() {
        @Override
        public void run() {
            finishWhenLoggedIn();
            if (!isFinishing()) {
                handler.postDelayed(this, COOKIE_CHECK_INTERVAL_MS);
            }
        }
    };

    private WebView webView;
    private ProgressBar progressBar;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("登录网易云账号");
        setContentView(createContentView());
        configureWebView();
        webView.loadUrl(LOGIN_URL);
        handler.post(cookieCheck);
    }

    private View createContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), 0, dp(12), 0);

        Button closeButton = new Button(this);
        closeButton.setText("关闭");
        closeButton.setAllCaps(false);
        closeButton.setOnClickListener(view -> cancelLogin());
        toolbar.addView(
            closeButton,
            new LinearLayout.LayoutParams(dp(72), dp(52))
        );

        TextView title = new TextView(this);
        title.setText("登录网易云账号");
        title.setTextColor(Color.BLACK);
        title.setTextSize(18);
        title.setGravity(Gravity.CENTER);
        toolbar.addView(
            title,
            new LinearLayout.LayoutParams(0, dp(52), 1)
        );

        View spacer = new View(this);
        toolbar.addView(spacer, new LinearLayout.LayoutParams(dp(72), dp(52)));
        root.addView(
            toolbar,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        );

        progressBar = new ProgressBar(
            this,
            null,
            android.R.attr.progressBarStyleHorizontal
        );
        progressBar.setMax(100);
        root.addView(
            progressBar,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(2)
            )
        );

        webView = new WebView(this);
        root.addView(
            webView,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1
            )
        );
        return root;
    }

    private void configureWebView() {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                WebView view,
                WebResourceRequest request
            ) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                finishWhenLoggedIn();
            }
        });
    }

    private void finishWhenLoggedIn() {
        String cookie = CookieManager.getInstance().getCookie(LOGIN_URL);
        if (cookie == null || !containsCookie(cookie, "MUSIC_U")) return;

        CookieManager.getInstance().flush();
        Intent result = new Intent();
        result.putExtra(RESULT_COOKIE, cookie);
        setResult(Activity.RESULT_OK, result);
        finish();
    }

    private boolean containsCookie(String cookie, String name) {
        for (String part : cookie.split(";")) {
            if (part.trim().startsWith(name + "=")) return true;
        }
        return false;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void cancelLogin() {
        setResult(Activity.RESULT_CANCELED);
        finish();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        cancelLogin();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(cookieCheck);
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
