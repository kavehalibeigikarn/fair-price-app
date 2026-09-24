package ir.kaveh.fairprice;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Receives links shared from the Divar app (ACTION_SEND) or opened with this app (ACTION_VIEW)
// and reloads the web app with ?share=<text> so it can analyze the ad.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }

    private void handle(Intent intent) {
        if (intent == null) return;
        String text = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) text = intent.getStringExtra(Intent.EXTRA_TEXT);
        else if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) text = intent.getData().toString();
        if (text == null || getBridge() == null) return;
        final String url = "https://localhost/?share=" + Uri.encode(text);
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
    }
}
