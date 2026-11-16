import { useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Products from "./components/Products";
import ProductDetails from "./pages/ProductDetails";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Login from "./pages/Login";
import MinhaConta from "./pages/MinhaConta";
import RadarTech from "./pages/RadarTech";
import Accessories from "./pages/Accessories";
import InstitutionalPage from "./pages/InstitutionalPages";
import { useAuth } from "./context/AuthContext";
import { AdminGuard } from "./components/AdminGuard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CookieConsent from "./components/CookieConsent";
import SiteFooter from "./components/SiteFooter";
import "./App.css";

function Home() {
  const previousPointerX = useRef<number | null>(null);
  const rotationY = useRef(0);

  const resetHeroVisual = (element: HTMLDivElement) => {
    previousPointerX.current = null;
    rotationY.current = 0;
    element.style.transitionDuration = "720ms";
    element.style.setProperty("--pointer-x", "50%");
    element.style.setProperty("--pointer-y", "45%");
    element.style.setProperty("--rotate-y", "0deg");
    element.style.setProperty("--tilt-x", "0deg");
  };

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
              <Link to="/iphones" className="button-primary">
                Explorar iPhones
              </Link>

              <Link to="/radar-tech" className="button-secondary">
                Conhecer o Radar Tech
              </Link>
            </div>
          </div>

          <div
            className="hero-visual"
            onPointerEnter={(event) => {
              previousPointerX.current = event.clientX;
              event.currentTarget.style.transitionDuration = "140ms";
            }}
            onPointerDown={(event) => {
              previousPointerX.current = event.clientX;
              event.currentTarget.style.transitionDuration = "120ms";
            }}
            onPointerMove={(event) => {
              if (
                event.pointerType === "touch" &&
                event.buttons === 0
              ) return;
              event.currentTarget.style.transitionDuration = "120ms";
              const bounds = event.currentTarget.getBoundingClientRect();
              const x = (event.clientX - bounds.left) / bounds.width;
              const y = (event.clientY - bounds.top) / bounds.height;
              event.currentTarget.style.setProperty("--pointer-x", `${x * 100}%`);
              event.currentTarget.style.setProperty("--pointer-y", `${y * 100}%`);
              const previousX = previousPointerX.current;
              if (previousX !== null) {
                rotationY.current = Math.max(
                  -360,
                  Math.min(360, rotationY.current + (event.clientX - previousX) * 1.1)
                );
              }
              previousPointerX.current = event.clientX;
              event.currentTarget.style.setProperty("--rotate-y", `${rotationY.current}deg`);
              event.currentTarget.style.setProperty("--tilt-x", `${(0.5 - y) * 8}deg`);
            }}
            onPointerUp={(event) => {
              if (event.pointerType === "touch") {
                resetHeroVisual(event.currentTarget);
              } else {
                previousPointerX.current = event.clientX;
              }
            }}
            onPointerCancel={(event) => resetHeroVisual(event.currentTarget)}
            onPointerLeave={(event) => {
              resetHeroVisual(event.currentTarget);
            }}
          >
            <div className="hero-visual-content">
              <span>ILUME</span>
              <p>O essencial da tecnologia.</p>
            </div>
          </div>
        </section>

        <section className="categories">
          <div className="section-heading">
            <span>EXPLORE ILUME</span>
            <h2>Explore o universo ILUME.</h2>
          </div>

          <div className="category-grid">
            <Link to="/iphones" className="category-card">
              <span className="category-art category-art--iphone" aria-hidden="true" />
              <span className="category-number">01</span>

              <div className="category-info">
                <h3>iPhones</h3>
                <p>Tecnologia e desempenho.</p>
              </div>

              <span className="category-arrow">↗︎</span>
            </Link>

            <Link to="/acessorios" className="category-card">
              <span className="category-art category-art--accessories" aria-hidden="true" />
              <span className="category-number">02</span>

              <div className="category-info">
                <h3>Acessórios</h3>
                <p>Detalhes que fazem diferença.</p>
              </div>

              <span className="category-arrow">↗︎</span>
            </Link>

            <Link to="/radar-tech" className="category-card">
              <span className="category-art category-art--radar" aria-hidden="true" />
              <span className="category-number">03</span>

              <div className="category-info">
                <h3>Radar Tech</h3>
                <p>Informação para acompanhar o futuro.</p>
              </div>

              <span className="category-arrow">↗︎</span>
            </Link>
          </div>
        </section>

        <Products />

        <section className="featured">
          <span>CURADORIA ILUME</span>
          <h2>Tecnologia que combina com você.</h2>
          <p>
            Uma seleção criteriosa de produtos que une
            inovação, qualidade e confiança em cada detalhe.
          </p>
        </section>
      </main>

    </>
  );
}

function IPhonesPage() {
  return (
    <main>
      <section className="featured">
        <span>ILUME COLLECTION</span>
        <h2>iPhones.</h2>
        <p>
          Tecnologia, desempenho e design em uma seleção
          especial de iPhones.
        </p>
      </section>

      <Products />
    </main>
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
      <Link to="/" className="button-primary">
        Voltar para o início
      </Link>
    </main>
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <>
      <Header />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/iphones" element={<IPhonesPage />} />
        
        <Route 
          path="/admin" 
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          } 
        />

        <Route path="/acessorios" element={<Accessories />} />
        <Route path="/acessorios/:category" element={<Accessories />} />

        <Route path="/radar-tech" element={<RadarTech />} />
        <Route path="/termos-de-uso" element={<InstitutionalPage page="terms" />} />
        <Route path="/politica-de-privacidade" element={<InstitutionalPage page="privacy" />} />
        <Route path="/politica-de-cookies" element={<InstitutionalPage page="cookies" />} />
        <Route path="/entrega-e-frete" element={<InstitutionalPage page="delivery" />} />
        <Route path="/trocas-e-devolucoes" element={<InstitutionalPage page="returns" />} />
        <Route path="/garantia" element={<InstitutionalPage page="warranty" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/minha-conta" element={<ProtectedAccount />} />
        <Route path="/produto/:slug" element={<ProductDetails />} />
        <Route path="/carrinho" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      {!location.pathname.startsWith("/admin") && <SiteFooter />}
      <CookieConsent />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
