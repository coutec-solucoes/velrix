import { useState } from 'react';
import { useTranslation } from '@/hooks/useI18n';
import { 
  BookOpen, Play, Settings, PlusCircle, ArrowRightLeft, DollarSign, 
  Users, UserCog, Building2, Download, FileText, FileDown, 
  Wallet, Layers, History, ShieldAlert, CheckCircle2, HandCoins,
  Globe2
} from 'lucide-react';

type TopicId = 'intro' | 'caixas' | 'financeiro' | 'clientes' | 'moedas' | 'usuarios';

export default function ManualTreinamento() {
  const [activeTopic, setActiveTopic] = useState<TopicId>('intro');
  const { t } = useTranslation();

  const topics = [
    { id: 'intro', icon: Play, title: 'Primeiros Passos' },
    { id: 'caixas', icon: Wallet, title: 'Caixas e Contas Bancárias' },
    { id: 'financeiro', icon: DollarSign, title: 'Gestão Financeira' },
    { id: 'moedas', icon: Globe2, title: 'Múltiplas Moedas' },
    { id: 'clientes', icon: Users, title: 'Clientes e Categorias' },
    { id: 'usuarios', icon: ShieldAlert, title: 'Acessos e Colaboradores' },
  ];

  const renderContent = () => {
    switch (activeTopic) {
      case 'intro':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                <Play className="text-secondary" /> Bem-vindo ao Velrix!
              </h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                Este manual foi desenhado para ajudá-lo a extrair o máximo de poder do seu novo sistema financeiro. O Velrix é uma ferramenta "Multi-Tenant" e "Multi-Moeda" de nível corporativo.
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Settings size={16} className="text-emerald-400" /> 1. Configure sua Matriz
              </h3>
              <p className="text-body-sm text-white/70">
                O primeiro passo fundamental é configurar os dados da sua empresa. Na aba <strong className="text-white">"Dados da Empresa"</strong> aqui nas Configurações, preencha o nome, CNPJ/RUC e faça o upload do seu <strong className="text-white">Logo</strong>.
              </p>
              <div className="bg-black/30 p-3 rounded-lg text-xs text-white/60 border border-white/5 flex items-start gap-3">
                <FileText size={16} className="shrink-0 text-white/40 mt-0.5" />
                <p>
                  <strong>Por que isso é importante?</strong> Seu logo e endereço serão automaticamente embutidos em todos os Contratos, Recibos e Relatórios PDF gerados pela plataforma.
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <HandCoins size={16} className="text-blue-400" /> 2. O Fluxo de Trabalho (Workflow)
              </h3>
              <ul className="space-y-3 text-body-sm text-white/70 list-none ml-0 pl-0">
                <li className="flex gap-2"><CheckCircle2 size={16} className="text-secondary shrink-0" /> Cadastre seus Caixas (Bancos, Cofre, Cartões).</li>
                <li className="flex gap-2"><CheckCircle2 size={16} className="text-secondary shrink-0" /> Cadastre seus Clientes e Categorias (para o plano de contas).</li>
                <li className="flex gap-2"><CheckCircle2 size={16} className="text-secondary shrink-0" /> Lance as moimentações no menu Financeiro definindo se estão Pagas ou Pendentes.</li>
              </ul>
            </div>
          </div>
        );

      case 'caixas':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                <Wallet className="text-secondary" /> Gestão de Múltiplos Caixas
              </h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                Você não precisa gerenciar tudo em uma "conta genérica". O sistema permite separar seu dinheiro fisicamente ou de forma lógica.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <PlusCircle size={14} className="text-emerald-400"/> Criando um Caixa
                </h4>
                <p className="text-body-sm text-white/70">
                  Vá no menu lateral <strong>"Caixas"</strong>. Lá você pode criar contas como "Itaú", "Caixa Física", ou "Cartão Corporativo". Cada caixa terá um saldo totalmente independente.
                </p>
              </div>
              
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <ArrowRightLeft size={14} className="text-blue-400"/> Transferências entre Caixas
                </h4>
                <p className="text-body-sm text-white/70 mb-2">
                  Para mover fundos (exemplo: Sacar dinheiro do Banco para o Cofre físico):
                </p>
                <ol className="list-decimal list-inside text-body-sm text-white/60 space-y-1">
                  <li>Na tela de Caixas, clique no botão azul <strong>"Nova Transferência"</strong>.</li>
                  <li>Selecione o Caixa de Origem (quem perde o salto).</li>
                  <li>Selecione o Caixa de Destino (quem ganha o saldo).</li>
                  <li>O extrato de ambos os caixas gravarão a operação com a tag "Transferência".</li>
                </ol>
              </div>
            </div>
          </div>
        );

      case 'financeiro':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                <DollarSign className="text-secondary" /> Módulo Financeiro
              </h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                O coração da plataforma onde transitam suas Receitas (Entradas) e Despesas (Saídas).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-emerald-400 mb-2">Receitas (Verdes)</h4>
                <p className="text-xs text-white/70">Vendas de produtos, prestações de serviços ou aportes. Aumentam o saldo bancário quando pagas.</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-red-400 mb-2">Despesas (Vermelhas)</h4>
                <p className="text-xs text-white/70">Contas de luz, pagamentos a fornecedores, salários. Deduzem do saldo bancário quando pagas.</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4 text-body-sm text-white/70">
              <h3 className="text-sm font-semibold text-white">Funções Premium</h3>
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <Layers className="text-secondary shrink-0" size={18} />
                  <div>
                    <strong className="text-white block">Geração de Parcelamentos</strong>
                    Ao lançar um valor (ex: R$ 1.000), você pode clicar na aba "Parcelar". O sistema dividirá automaticamente em quantas vezes você desejar (ex: 5x de R$ 200,00) lançando todas as contas futuras com datas de vencimento mensais precisas.
                  </div>
                </li>
                <li className="flex gap-3">
                  <FileDown className="text-blue-400 shrink-0" size={18} />
                  <div>
                    <strong className="text-white block">Contratos em PDF</strong>
                    Na listagem financeira, selecione uma transação e clique no botão de "Baixar PDF". O sistema criará um Contrato formal (com seu logo) ou Recibo para assinatura física.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        );

      case 'moedas':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                <Globe2 className="text-secondary" /> Internacionalização: Múltiplas Moedas
              </h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                Operando fora do país ou importando produtos? O módulo cambial mantém sua contabilidade perfeita.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Como operar multi-moedas:</h3>
              <ol className="list-decimal list-inside text-body-sm text-white/70 space-y-3">
                <li>Vá até a aba <strong>"Geral"</strong> nas Configurações do admin e habilite "Sistema Multi-Moeda" (Disponível em Planos PRO ou Superiores).</li>
                <li>Na seção de <strong>"Cotações de Câmbio"</strong>, ajuste a cotação do dia. (Ex: 1 R$ = 1.300 Gs). O sistema memoriza o histórico de alterações para auditoria.</li>
                <li>No momento de criar um Novo Lançamento no Menu Financeiro, você verá um seletor ao lado de "Valor" perguntando se é BRL, USD ou PYG.</li>
                <li><strong>Mágica contábil:</strong> Se você der baixa de R$ 100 em um Caixa do Paraguai que opera em Guaranis, o sistema injeta os Gs 130.000 convertidos automaticamente no cofre sem que você faça contas manuais!</li>
              </ol>
            </div>
          </div>
        );

      case 'clientes':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                <Users className="text-secondary" /> Base de Contatos e Categorias
              </h2>
            </div>
            
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-2">Clientes e Fornecedores</h3>
                <p className="text-body-sm text-white/70">
                  O painel de clientes funciona como um mini-CRM. Cadastre Razão Social, CNPJ/RUC e vincule transações a eles no módulo Financeiro para depois puxar um extrato detalhado "De quem eu mais compro?" ou "Quem mais me deve?".
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-2">Plano de Categorias (Para Relatórios)</h3>
                <p className="text-body-sm text-white/70">
                  Cadastre categorias em pastinhas como "Infraestrutura", "Folha de Pagamento", "Vendas Online". Isso é vital para que a área de Relatórios mostre gráficos bonitos com a distribuição percentual do seu negócio (Ex: 40% dos gastos estão indo para Infraestrutura).
                </p>
              </div>
            </div>
          </div>
        );

      case 'usuarios':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                <ShieldAlert className="text-secondary" /> Gestão de Colaboradores e Auditoria
              </h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                Você não precisa passar sua senha master para os funcionários do seu setor contábil.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                <UserCog size={16} /> Acessos Individuais
              </h3>
              <div className="space-y-3 text-body-sm text-white/70">
                <p><strong>1. Convidar:</strong> Na aba "Usuários e Acessos" em configurações, clique em "Adicionar Usuário". Determine um Nome de usuário (Login) e Senha única para ele.</p>
                <p><strong>2. Rastreamento:</strong> Toda operação que esse funcionário fizer (Apagar um cliente, lançar uma receita manual) gravará o seu nome de usuário. O sistema implementa uma camada invisível de Logs (Trilha de Auditoria) que você, dono, pode rastrear.</p>
                <p><strong>3. Tela de Login:</strong> Ao enviar o sistema para a equipe, eles devem na tela inicial de Login selecionar a aba <strong>"Acesso Colaborador"</strong> no topo da tela e informar também o seu PIN de Companhia único.</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-background border border-border rounded-xl overflow-hidden card-shadow min-h-[600px] flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 bg-card/50 border-r border-border p-4 flex flex-col gap-1.5 shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">
          Índice do Manual
        </h3>
        {topics.map((topic) => {
          const Icon = topic.icon;
          const isActive = activeTopic === topic.id;
          return (
            <button
              key={topic.id}
              onClick={() => setActiveTopic(topic.id as TopicId)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                isActive 
                ? 'bg-secondary/20 text-secondary border border-secondary/30' 
                : 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-secondary' : 'text-white/40'} />
              {topic.title}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-card">
        {renderContent()}
      </div>
    </div>
  );
}
