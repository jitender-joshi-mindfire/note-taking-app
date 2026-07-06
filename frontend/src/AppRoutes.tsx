import { Navigate, Route, Routes } from "react-router";
import { RedirectIfAuthed } from "@/components/RedirectIfAuthed";
import { RequireAuth } from "@/components/RequireAuth";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { LoginPage } from "@/pages/LoginPage";
import { NoteCreateStubPage } from "@/pages/NoteCreateStubPage";
import { NoteDetailStubPage } from "@/pages/NoteDetailStubPage";
import { NotesPage } from "@/pages/NotesPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <RegisterPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <RedirectIfAuthed>
            <ForgotPasswordPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/reset-password"
        element={
          <RedirectIfAuthed>
            <ResetPasswordPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/notes"
        element={
          <RequireAuth>
            <NotesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/notes/new"
        element={
          <RequireAuth>
            <NoteCreateStubPage />
          </RequireAuth>
        }
      />
      <Route
        path="/notes/:id"
        element={
          <RequireAuth>
            <NoteDetailStubPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
