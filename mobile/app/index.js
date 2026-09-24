import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

const MISEVO_URL = "https://ficha-tecnica-docker-production.up.railway.app/";

export default function MisevoApp() {
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  return (
    <SafeAreaView style={styles.root}>
      <WebView
        ref={webRef}
        source={{ uri: MISEVO_URL }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        pullToRefreshEnabled
        cacheEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        onLoadStart={() => { setLoading(true); setOffline(false); }}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        onError={() => { setLoading(false); setOffline(true); }}
        renderError={() => <View />}
      />

      {loading && !offline && (
        <View style={styles.loading}>
          <View style={styles.mark}>
            <Text style={styles.markText}>M</Text>
          </View>
          <ActivityIndicator size="large" color="#D4A62A" />
          <Text style={styles.brand}>MISEVO</Text>
          <Text style={styles.text}>Carregando sistema...</Text>
        </View>
      )}

      {offline && (
        <View style={styles.offline}>
          <View style={styles.mark}>
            <Text style={styles.markText}>M</Text>
          </View>
          <Text style={styles.title}>Sem conexão</Text>
          <Text style={styles.text}>Não foi possível acessar o MISEVO.</Text>
          <Text style={styles.retry} onPress={() => {
            setOffline(false);
            setLoading(true);
            webRef.current?.reload();
          }}>Tentar novamente</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8F6F2" },
  web: { flex: 1, backgroundColor: "#F8F6F2" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F4C5C"
  },
  offline: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: "#F8F6F2"
  },
  mark: {
    width: 84, height: 84, borderRadius: 22, backgroundColor: "#0F4C5C",
    borderWidth: 3, borderColor: "#D4A62A", alignItems: "center",
    justifyContent: "center", marginBottom: 22
  },
  markText: { color: "#FFFFFF", fontSize: 48, fontWeight: "900" },
  brand: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", letterSpacing: 3, marginTop: 18 },
  title: { color: "#2E3A42", fontSize: 24, fontWeight: "800", marginTop: 8 },
  text: { color: "#DDE6E8", fontSize: 15, marginTop: 10, textAlign: "center" },
  retry: {
    color: "#0F4C5C", fontSize: 16, fontWeight: "800", marginTop: 24,
    paddingVertical: 12, paddingHorizontal: 22
  }
});
