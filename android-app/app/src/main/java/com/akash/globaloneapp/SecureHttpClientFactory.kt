package com.akash.globaloneapp

import okhttp3.OkHttpClient
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

object SecureHttpClientFactory {
    private data class TlsConfiguration(
        val sslContext: SSLContext,
        val trustManager: X509TrustManager
    )

    private val tlsConfiguration: TlsConfiguration by lazy {
        val context = GlobalOneApplication.instance
        val rapidSslIntermediate = context.resources.openRawResource(R.raw.rapidssl_tls_rsa_ca_g1).use { input ->
            CertificateFactory.getInstance("X.509").generateCertificate(input) as X509Certificate
        }
        val digiCertGlobalRootG2 = context.resources.openRawResource(R.raw.digicert_global_root_g2).use { input ->
            CertificateFactory.getInstance("X.509").generateCertificate(input) as X509Certificate
        }

        val customStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null)
            setCertificateEntry("rapidssl-tls-rsa-ca-g1", rapidSslIntermediate)
            setCertificateEntry("digicert-global-root-g2", digiCertGlobalRootG2)
        }
        val customTrustManager = trustManagerFor(customStore)
        val platformTrustManager = trustManagerFor(null)
        val compositeTrustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                platformTrustManager.checkClientTrusted(chain, authType)
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                try {
                    platformTrustManager.checkServerTrusted(chain, authType)
                } catch (platformFailure: java.security.cert.CertificateException) {
                    try {
                        customTrustManager.checkServerTrusted(chain, authType)
                    } catch (customFailure: java.security.cert.CertificateException) {
                        customFailure.addSuppressed(platformFailure)
                        throw customFailure
                    }
                }
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> =
                platformTrustManager.acceptedIssuers + customTrustManager.acceptedIssuers
        }
        val sslContext = SSLContext.getInstance("TLS").apply {
            init(null, arrayOf(compositeTrustManager), null)
        }
        TlsConfiguration(sslContext, compositeTrustManager)
    }

    fun builder(): OkHttpClient.Builder = OkHttpClient.Builder()
        .sslSocketFactory(tlsConfiguration.sslContext.socketFactory, tlsConfiguration.trustManager)

    private fun trustManagerFor(keyStore: KeyStore?): X509TrustManager {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
            init(keyStore)
        }
        return factory.trustManagers.filterIsInstance<X509TrustManager>().single()
    }
}
