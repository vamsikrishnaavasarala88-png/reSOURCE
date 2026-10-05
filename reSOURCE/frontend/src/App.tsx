import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import CreateMaterialPage from './pages/CreateMaterialPage';
import CreateSpacePage from './pages/CreateSpacePage';
import DashboardPage from './pages/DashboardPage';
import EditSpacePage from './pages/EditSpacePage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import MySpacesPage from './pages/MySpacesPage';
import EditMaterialPage from './pages/EditMaterialPage';
import MaterialDetailPage from './pages/MaterialDetailPage';
import MaterialRequestPage from './pages/MaterialRequestPage';
import MaterialsPage from './pages/MaterialsPage';
import NotFoundPage from './pages/NotFoundPage';
import ProfilePage from './pages/ProfilePage';
import RegisterPage from './pages/RegisterPage';
import BookingsPage from './pages/BookingsPage';
import RequestsPage from './pages/RequestsPage';
import RequestDetailPage from './pages/RequestDetailPage';
import RequestSpacePage from './pages/RequestSpacePage';
import SpaceDetailPage from './pages/SpaceDetailPage';
import SpacesPage from './pages/SpacesPage';

/**
 * Route table. Public: home, spaces, materials, login, register.
 * Everything behind `ProtectedRoute` requires a signed-in user.
 *
 * The request workflow lives on its own routes: requesting a space, the two
 * request lists, one request, and the bookings that acceptance produces.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/spaces" element={<SpacesPage />} />
        <Route path="/spaces/:id" element={<SpaceDetailPage />} />

        <Route
          path="/spaces/create"
          element={
            <ProtectedRoute>
              <CreateSpacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/spaces/mine"
          element={
            <ProtectedRoute>
              <MySpacesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/spaces/:id/edit"
          element={
            <ProtectedRoute>
              <EditSpacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/spaces/:id/request"
          element={
            <ProtectedRoute>
              <RequestSpacePage />
            </ProtectedRoute>
          }
        />

        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/materials/:id" element={<MaterialDetailPage />} />
        <Route
          path="/materials/create"
          element={
            <ProtectedRoute>
              <CreateMaterialPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/materials/:id/edit"
          element={
            <ProtectedRoute>
              <EditMaterialPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/materials/:id/request"
          element={
            <ProtectedRoute>
              <MaterialRequestPage />
            </ProtectedRoute>
          }
        />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests"
          element={
            <ProtectedRoute>
              <RequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          // The inbox used to be a page of its own; it is part of /requests now,
          // so old links keep working instead of landing on a dead end.
          path="/requests/incoming"
          element={<Navigate to="/requests" replace />}
        />
        <Route
          path="/requests/:id"
          element={
            <ProtectedRoute>
              <RequestDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <BookingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
