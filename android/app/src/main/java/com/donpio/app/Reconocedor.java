package com.donpio.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Reconocedor de voz propio, con el control fino que el plugin de la
 * comunidad no expone.
 *
 * Lo que arregla, y por qué existe:
 *
 * - Los tiempos de silencio se piden largos (EXTRA_SPEECH_INPUT_*): el
 *   repartidor dicta con pausas y el reconocedor por defecto corta a los ~2
 *   segundos. Cada corte obliga a reabrir la escucha, y en ese hueco se
 *   pierden palabras — de ahí los dictados que llegaban a medias.
 *
 * - EXTRA_PREFER_OFFLINE: con el paquete de voz en español descargado, el
 *   reconocimiento corre en el teléfono. Sin esto, con señal débil el
 *   servicio intenta ir a la red y se queda pensando varios segundos — la
 *   demora que se siente al dictar. Si el teléfono no tiene el paquete, el
 *   lado JS reintenta sin esta bandera.
 *
 * - Se emite también el resultado FINAL de cada tramo (onResults), no solo
 *   los parciales: el servicio corrige la frase completa al cerrarla y esa
 *   versión es mejor que el último parcial.
 *
 * - Cada arranque crea un SpeechRecognizer nuevo: reutilizar la instancia
 *   tras un error deja al servicio "ocupado" (ERROR_RECOGNIZER_BUSY) y es la
 *   causa clásica de "le hablo y no pasa nada".
 */
@CapacitorPlugin(
    name = "Reconocedor",
    permissions = @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microfono")
)
public class Reconocedor extends Plugin {

    private SpeechRecognizer reconocedor;

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject r = new JSObject();
        r.put("disponible", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "alPermiso");
            return;
        }
        arrancar(call);
    }

    @PermissionCallback
    private void alPermiso(PluginCall call) {
        if (getPermissionState("microfono") == PermissionState.GRANTED) {
            arrancar(call);
        } else {
            call.reject("sin-permiso");
        }
    }

    private void arrancar(PluginCall call) {
        String idioma = call.getString("idioma", "es-PE");
        boolean preferirOffline = Boolean.TRUE.equals(call.getBoolean("preferirOffline", true));
        int silencioMs = call.getInt("silencioMs", 4000);

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(
            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, idioma);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, idioma);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferirOffline);
        // Son sugerencias — el servicio puede ignorarlas — pero donde se
        // respetan, la escucha aguanta las pausas del dictado real.
        intent.putExtra(
            RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
            silencioMs
        );
        intent.putExtra(
            RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS,
            silencioMs
        );
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 2000);

        // SpeechRecognizer exige el hilo principal, para crear y para todo.
        getActivity().runOnUiThread(() -> {
            try {
                soltarReconocedor();
                reconocedor = SpeechRecognizer.createSpeechRecognizer(getContext());
                reconocedor.setRecognitionListener(new Oyente());
                reconocedor.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("no-se-pudo-abrir");
            }
        });
    }

    @PluginMethod
    public void detener(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (reconocedor != null) {
                try {
                    reconocedor.stopListening();
                } catch (Exception ignorada) {}
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void cancelar(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            soltarReconocedor();
            call.resolve();
        });
    }

    private void soltarReconocedor() {
        if (reconocedor != null) {
            try {
                reconocedor.cancel();
                reconocedor.destroy();
            } catch (Exception ignorada) {}
            reconocedor = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        soltarReconocedor();
    }

    private String primerTexto(Bundle resultados) {
        if (resultados == null) return "";
        ArrayList<String> lista = resultados.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (lista == null || lista.isEmpty()) return "";
        String t = lista.get(0);
        return t == null ? "" : t;
    }

    private class Oyente implements RecognitionListener {
        @Override
        public void onPartialResults(Bundle parciales) {
            String texto = primerTexto(parciales);
            if (texto.isEmpty()) return;
            JSObject datos = new JSObject();
            datos.put("texto", texto);
            notifyListeners("parcial", datos);
        }

        @Override
        public void onResults(Bundle resultados) {
            // El final del tramo, ya repasado por el servicio: suele venir
            // mejor puntuado que el último parcial. El lado JS lo acumula y
            // decide si reabrir la escucha.
            JSObject datos = new JSObject();
            datos.put("texto", primerTexto(resultados));
            datos.put("motivo", "resultado");
            notifyListeners("corte", datos);
        }

        @Override
        public void onError(int codigo) {
            String motivo;
            switch (codigo) {
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    // Silencio normal entre frases, no un fallo.
                    motivo = "silencio";
                    break;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                case SpeechRecognizer.ERROR_SERVER:
                case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
                    motivo = "red";
                    break;
                case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
                case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                    motivo = "idioma";
                    break;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                    motivo = "permiso";
                    break;
                default:
                    motivo = "error";
            }
            JSObject datos = new JSObject();
            datos.put("texto", "");
            datos.put("motivo", motivo);
            datos.put("codigo", codigo);
            notifyListeners("corte", datos);
        }

        @Override public void onReadyForSpeech(Bundle params) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int eventType, Bundle params) {}
    }
}
