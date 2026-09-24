import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

const MISEVO_URL = "https://ficha-tecnica-docker-production.up.railway.app/";

export default function MisevoApp() {
  const [loading, setLoading] = useState(true);
  const [web, setWeb] = useState(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && web) {
        web.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack, web]);

  return (
    <SafeAreaView style={styles.root}>
      <WebView
        ref={setWeb}
        source={{ uri: MISEVO_URL }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        startInLoadingState
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        renderError={() => (
          <View style={styles.center}>
            <Text style={styles.title}>Sem conexão</Text>
            <Text style={styles.text}>Não foi possível carregar o MISEVO.</Text>
          </View>
        )}
      />
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
          <Text style={styles.text}>Carregando MISEVO...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  web: { flex: 1, backgroundColor: "#fff" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  text: { fontSize: 15, marginTop: 10, textAlign: "center" }
});
