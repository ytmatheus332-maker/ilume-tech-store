
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Products from "./components/Products";
import ProductDetails from "./pages/ProductDetails";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Login from "./pages/Login";
import MinhaConta from "./pages/MinhaConta";
import { useAuth } from "./context/AuthContext";
import "./App.css";

function Home() {
  return (
    <>
      <main>
        <section className="hero">
          <div className="hero-content">
            <span className="hero-label">ILUME TECH STORE</span>

            <h1>
              Tecnologia.
              <br />
              Sem excessos.
            </h1>

            <p>
              Encontre tecnologia que combina com você.
              Uma experiência de compra simples, moderna e segura.
            </p>

            <div className="hero-actions">
              <a href="/iphones" className="button-primary">
                Explorar iPhones
              </a>

              <a href="/radar-tech" className="button-secondary">
                Conhecer o Radar Tech
              </a>
            </div>
          </div>

          <div className="hero-visual">
            <span>ILUME</span>
            <p>O essencial da tecnologia.</p>
          </div>
        </section>

        <section className="categories">
          <div className="section-heading">
            <span>EXPLORE</span>
            <h2>Encontre o que procura.</h2>
          </div>

          <div className="category-grid">
            <a href="/iphones" className="category-card">
              <span>01</span>
              <h3>iPhones</h3>
              <p>Tecnologia e desempenho.</p>
            </a>

            <a href="/acessorios" className="category-card">
              <span>02</span>
              <h3>Acessórios</h3>
              <p>Detalhes que fazem diferença.</p>
            </a>

            <a href="/radar-tech" className="category-card">
              <span>03</span>
              <h3>Radar Tech</h3>
              <p>Informação para acompanhar o futuro.</p>
            </a>
          </div>
        </section>

        <Products />

        <section className="featured">
          <span>CURADORIA ILUME</span>
          <h2>Tecnologia escolhida com cuidado.</h2>
          <p>
            Estamos preparando nossa seleção de produtos
            para oferecer uma experiência de compra completa.
          </p>
        </section>
      </main>

      <footer className="footer">
        <span>ILUME</span>
        <p>Tecnologia. Sem excessos.</p>

        <div className="footer-anniversary">
          <strong>10</strong>
          <div>
            <span>ANOS DE</span>
            <span>MERCADO</span>
          </div>
        </div>

        <small>© 2026 ILUME TECH STORE.</small>
      </footer>
    </>
  );
}

function ProtectedAccount() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="account-page">
        <p>Carregando sua conta...</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <MinhaConta />;
}

function NotFound() {
  return (
    <main className="featured">
      <span>404</span>
      <h2>Página não encontrada.</h2>
      <p>O endereço que você acessou não está disponível.</p>
      <a href="/" className="button-primary">
        Voltar para o início
      </a>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Header />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/minha-conta" element={<ProtectedAccount />} />
        <Route path="/produto/:slug" element={<ProductDetails />} />
        <Route path="/carrinho" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
