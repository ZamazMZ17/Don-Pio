package com.donpio.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El reconocedor de voz propio (ver Reconocedor.java): se registra
        // antes de super.onCreate, que es cuando Capacitor arma el puente.
        registerPlugin(Reconocedor.class);
        super.onCreate(savedInstanceState);
    }
}
