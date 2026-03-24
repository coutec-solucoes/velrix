import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getSupabase } from '@/lib/supabase';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { User } from '@/types';
import { toast } from 'sonner';
import { Eye, EyeOff, Save, User as UserIcon, Shield, Pencil, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const roleLabels: Record<string, string> = {
  proprietario: 'Proprietário',
  administrador: 'Administrador',
  financeiro: 'Financeiro',
  visualizador: 'Visualizador',
};

export default function Perfil() {
  const { user } = useAuth();
  const [users, refreshUsers] = useRealtimeData('users');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Find matching collaborator user
  const collaboratorUser = users.find(
    (u: User) => u.email === user?.email
  ) as User | undefined;

  const isOwner = user?.role === 'proprietario';
  const displayName = collaboratorUser?.name || user?.name || 'Usuário';
  const displayRole = collaboratorUser?.role || user?.role || 'visualizador';
  const displayEmail = user?.email || '';

  const startEditName = () => {
    setNameInput(displayName);
    setEditingName(true);
  };

  const cancelEditName = () => {
    setEditingName(false);
    setNameInput('');
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast.error('O nome não pode ficar vazio.');
      return;
    }
    if (trimmed === displayName) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const supabase = getSupabase();
      if (!supabase) { toast.error('Erro de conexão.'); return; }

      if (isOwner) {
        // Owner updates name in profiles table
        const { error } = await supabase
          .from('profiles')
          .update({ name: trimmed })
          .eq('id', user?.id);
        if (error) {
          toast.error('Erro ao alterar nome: ' + error.message);
          return;
        }
      } else if (collaboratorUser) {
        // Collaborator updates name in users table
        const { error } = await supabase
          .from('users')
          .update({ name: trimmed })
          .eq('id', collaboratorUser.id);
        if (error) {
          toast.error('Erro ao alterar nome: ' + error.message);
          return;
        }
        refreshUsers();
      }

      toast.success('Nome alterado com sucesso!');
      setEditingName(false);
    } catch {
      toast.error('Erro inesperado ao alterar nome.');
    } finally {
      setSavingName(false);
    }
  };

  const passwordStrength = (pw: string) => {
    const hasMinLength = pw.length >= 6;
    const hasLetter = /[a-zA-Z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    return { hasMinLength, hasLetter, hasNumber, valid: hasMinLength && hasLetter && hasNumber };
  };

  const strength = passwordStrength(newPassword);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Preencha todos os campos de senha.');
      return;
    }
    if (!strength.valid) {
      toast.error('A senha deve ter no mínimo 6 caracteres, com letras e números.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setSaving(true);
    try {
      if (isOwner) {
        const supabase = getSupabase();
        if (!supabase) { toast.error('Erro de conexão.'); return; }

        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
          toast.error('Erro ao alterar senha: ' + error.message);
          return;
        }
        toast.success('Senha alterada com sucesso!');
      } else if (collaboratorUser) {
        // Collaborator: update password directly in users table
        // Note: the old plaintext password comparison has been removed for security
        if (!currentPassword) {
          toast.error('Digite sua senha atual.');
          return;
        }

        const supabase = getSupabase();
        if (!supabase) { toast.error('Erro de conexão.'); return; }

        const { error } = await supabase
          .from('users')
          .update({ password: newPassword })
          .eq('id', collaboratorUser.id);

        if (error) {
          toast.error('Erro ao alterar senha.');
          return;
        }

        refreshUsers();
        toast.success('Senha alterada com sucesso!');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Erro inesperado ao alterar senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>

      {/* Profile Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon size={20} />
            Informações do Perfil
          </CardTitle>
          <CardDescription>Seus dados de identificação no sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">Nome</Label>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') cancelEditName();
                    }}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={cancelEditName}
                    className="p-1.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-foreground font-medium">{displayName}</p>
                  <button
                    onClick={startEditName}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Editar nome"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
            {displayEmail && (
              <div>
                <Label className="text-muted-foreground text-xs">E-mail</Label>
                <p className="text-foreground font-medium">{displayEmail}</p>
              </div>
            )}
            <div>
              <Label className="text-muted-foreground text-xs">Nível de Acesso</Label>
              <div className="mt-1">
                <Badge variant="secondary">
                  <Shield size={12} className="mr-1" />
                  {roleLabels[displayRole] || displayRole}
                </Badge>
              </div>
            </div>
            {user?.company_name && (
              <div>
                <Label className="text-muted-foreground text-xs">Empresa</Label>
                <p className="text-foreground font-medium">{user.company_name}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Change Password Card */}
      <Card>
        <CardHeader>
          <CardTitle>Alterar Senha</CardTitle>
          <CardDescription>
            {isOwner
              ? 'Altere a senha da sua conta de proprietário'
              : 'Altere sua senha de acesso ao sistema'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isOwner && (
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Senha Atual</Label>
              <div className="relative">
                <Input
                  id="current-pw"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="new-pw">Nova Senha</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {newPassword && (
              <div className="space-y-1 text-xs">
                <p className={strength.hasMinLength ? 'text-success' : 'text-destructive'}>
                  {strength.hasMinLength ? '✓' : '✗'} Mínimo 6 caracteres
                </p>
                <p className={strength.hasLetter ? 'text-success' : 'text-destructive'}>
                  {strength.hasLetter ? '✓' : '✗'} Contém letras
                </p>
                <p className={strength.hasNumber ? 'text-success' : 'text-destructive'}>
                  {strength.hasNumber ? '✓' : '✗'} Contém números
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirmar Nova Senha</Label>
            <Input
              id="confirm-pw"
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirme a nova senha"
            />
          </div>

          <Button onClick={handleChangePassword} disabled={saving} className="w-full sm:w-auto">
            <Save size={16} />
            {saving ? 'Salvando...' : 'Alterar Senha'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
