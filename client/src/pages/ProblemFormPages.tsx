import { Link, useNavigate, useParams } from 'react-router';
import { useCreateProblem, useProblem, useUpdateProblem } from '../api/problems';
import ProblemForm from '../components/ProblemForm';
import { ErrorState, Loading } from '../components/PageStates';

export function NewProblemPage() {
  const navigate = useNavigate();
  const create = useCreateProblem();

  return (
    <>
      <Link to="/problems" className="back-link">
        ← Problems
      </Link>
      <h1>Add problem</h1>
      <p className="muted">Paste a LeetCode link to fill in the details, then add your own notes.</p>
      <ProblemForm
        submitLabel="Save problem"
        onSubmit={async (input) => {
          const problem = await create.mutateAsync(input);
          navigate(`/problems/${problem.id}`);
        }}
        onCancel={() => navigate('/problems')}
      />
    </>
  );
}

export function EditProblemPage() {
  const id = useParams().id!;
  const navigate = useNavigate();
  const problem = useProblem(id);
  const update = useUpdateProblem(id);

  if (problem.isPending) return <Loading />;
  if (problem.isError) return <ErrorState error={problem.error} onRetry={() => problem.refetch()} />;

  return (
    <>
      <Link to={`/problems/${id}`} className="back-link">
        ← {problem.data.title}
      </Link>
      <h1>Edit problem</h1>
      <ProblemForm
        initial={problem.data}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          await update.mutateAsync(input);
          navigate(`/problems/${id}`);
        }}
        onCancel={() => navigate(`/problems/${id}`)}
      />
    </>
  );
}
