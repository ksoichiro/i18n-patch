class Foo
  def create
    redirect_to foo_path, notice: 'Successfully created.'
  end
end
